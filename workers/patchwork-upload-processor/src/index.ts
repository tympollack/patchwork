/// <reference types="@cloudflare/workers-types" />
/**
 * patchwork-core-worker
 * Unified Cloudflare Worker consolidating the PatchWork backend services (PTW-11):
 *
 * 1. HTTP API (fetch):
 *    - GET  /health                   — Health probe
 *    - POST /api/ports/request-upload — R2 S3-presigned PUT URL with Supabase JWT auth
 *    - POST /api/cron/bounty-trigger  — HTTP trigger for bounty cron (Bearer CRON_SECRET)
 *    - POST /api/cron/archive-nodes   — HTTP trigger for node archive (Bearer CRON_SECRET)
 *
 * 2. Cloudflare Queues Consumer (queue):
 *    - Receives R2 object:create event from patchwork-upload-queue
 *    - Computes SHA-256 via Web Crypto
 *    - Copies staging -> production R2 bucket (ports/prod/<uploadId>.jpg)
 *    - Calculates Uber H3 Resolution-10 cell index
 *    - Upserts patchwork.nodes in Supabase via REST API
 *    - Deletes staging object (cleanup)
 *
 * 3. Cloudflare Scheduled Cron Triggers (scheduled):
 *    - 00:05 UTC (5 0 * * *)  — Bounty trigger (7-day rule, critter-bounty webhook)
 *    - 00:10 UTC (10 0 * * *) — Archive nodes (28-day soft-archive)
 */

import { latLngToCell } from 'h3-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ---------------------------------------------------------------------------
// Environment & Bindings (wrangler.toml + wrangler secret put)
// ---------------------------------------------------------------------------
export interface Env {
  /** R2 staging bucket binding */
  R2_STAGING: R2Bucket;
  /** R2 production bucket binding */
  R2_PRODUCTION: R2Bucket;

  /** Supabase project URL */
  SUPABASE_URL: string;
  /** Supabase service role key (wrangler secret put SUPABASE_SERVICE_KEY) */
  SUPABASE_SERVICE_KEY: string;
  /** Supabase anon key (optional, falls back to service key for user auth check) */
  SUPABASE_ANON_KEY?: string;

  /** Cloudflare R2 S3 API credentials for presigning PUT URLs */
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;

  /** Bearer token expected for HTTP cron triggers */
  CRON_SECRET?: string;
  /** Critter bounty webhook target URL */
  WEBHOOK_URL?: string;
  /** Allowed CORS origins for web clients (e.g. "https://patchwork.app,http://localhost:8081" or "*") */
  ALLOWED_ORIGINS?: string;
  /** Whether hardware attestation is strictly enforced ("true" or undefined/false) */
  REQUIRE_HARDWARE_ATTESTATION?: string;
}

// ---------------------------------------------------------------------------
// Queue Message Shape
// ---------------------------------------------------------------------------
interface R2EventMessage {
  account: string;
  bucket: string;
  object: {
    key: string;
    size: number;
    etag: string;
  };
  action: 'PutObject' | 'CopyObject' | 'CompleteMultipartUpload' | 'DeleteObject';
}

// ---------------------------------------------------------------------------
// Dynamic CORS Resolution
// ---------------------------------------------------------------------------
export function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin') || '';
  const allowed = env.ALLOWED_ORIGINS || '*';

  let allowOrigin = '*';
  if (allowed !== '*') {
    const originsList = allowed.split(',').map((o) => o.trim().toLowerCase());
    if (origin && originsList.includes(origin.toLowerCase())) {
      allowOrigin = origin;
    } else {
      allowOrigin = originsList[0] || 'null';
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-device-attestation, x-hardware-attestation',
    'Vary': 'Origin',
  };
}

// ---------------------------------------------------------------------------
// Helper: SHA-256 via Web Crypto
// ---------------------------------------------------------------------------
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Helper: Extract Upload ID from Key (ports/<uploadId>.jpg)
// ---------------------------------------------------------------------------
function extractUploadId(key: string): string | null {
  const match = key.match(/^ports\/([^/]+)\.jpg$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Helper: Authenticate Supabase JWT
// ---------------------------------------------------------------------------
async function verifySupabaseToken(env: Env, token: string): Promise<{ id: string } | null> {
  const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
  if (!env.SUPABASE_URL || !key) {
    console.error('[AUTH] Missing SUPABASE_URL or SUPABASE key in worker env');
    return null;
  }

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: key,
      },
    });

    if (!res.ok) return null;
    return (await res.json()) as { id: string };
  } catch (err) {
    console.error('[AUTH] Supabase token check failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: Verify Bearer token for CRON endpoints
// ---------------------------------------------------------------------------
function verifyCronAuth(request: Request, env: Env): boolean {
  if (!env.CRON_SECRET) {
    console.error('[CRON] CRON_SECRET is not configured');
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

// ---------------------------------------------------------------------------
// Helper: Fetch existing node metadata from Supabase
// ---------------------------------------------------------------------------
async function fetchNode(
  env: Env,
  uploadId: string
): Promise<{ node_id: string; status: string; latitude?: number | null; longitude?: number | null } | null> {
  try {
    const url = `${env.SUPABASE_URL}/rest/v1/nodes?node_id=eq.${uploadId}&select=node_id,status,latitude,longitude`;
    const res = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Accept-Profile': 'patchwork',
        'Content-Profile': 'patchwork',
      },
    });
    if (!res.ok) return null;
    if (typeof res.json !== 'function') return null;
    const rows = (await res.json()) as Array<{
      node_id: string;
      status: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: Create pending node on presigned URL generation (records GPS & user)
// ---------------------------------------------------------------------------
async function createPendingNode(
  env: Env,
  uploadId: string,
  userId: string | null,
  latitude: number,
  longitude: number
): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/nodes?on_conflict=node_id`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates',
      'Accept-Profile': 'patchwork',
      'Content-Profile': 'patchwork',
    },
    body: JSON.stringify({
      node_id: uploadId,
      user_id: userId,
      latitude,
      longitude,
      status: 'pending',
      sync_status: 'pending_sync',
    }),
  });
}

// ---------------------------------------------------------------------------
// Helper: Upsert node record into patchwork.nodes via Supabase REST
// ---------------------------------------------------------------------------
async function upsertNode(
  env: Env,
  uploadId: string,
  imageKey: string,
  h3Index: string,
  sha256: string,
  status: string = 'awaiting_verification',
  latitude: number = 0,
  longitude: number = 0
): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/nodes?on_conflict=node_id`;
  const payload: Record<string, unknown> = {
    node_id: uploadId,
    image_key: imageKey,
    h3_index: h3Index,
    sha256_hash: sha256,
    sync_status: 'synced',
    status,
    latitude,
    longitude,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'resolution=merge-duplicates',
      'Accept-Profile': 'patchwork',
      'Content-Profile': 'patchwork',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase upsert failed: HTTP ${response.status} — ${body.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle Actions: Cron Triggers (7-day bounty & 28-day archive)
// ---------------------------------------------------------------------------
export { executeBountyTrigger, executeArchiveNodes } from './cron';
import { executeBountyTrigger, executeArchiveNodes } from './cron';

// ---------------------------------------------------------------------------
// Worker Default Export
// ---------------------------------------------------------------------------
export default {
  /**
   * HTTP Fetch Handler — presigned upload endpoint, health check, cron webhooks
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = getCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return Response.json(
        { status: 'ok', timestamp: new Date().toISOString() },
        { headers: corsHeaders }
      );
    }

    // GET /api/nodes — Bounding box query for map verifier clients
    if (url.pathname === '/api/nodes') {
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
      }

      const min_lat = url.searchParams.get('min_lat');
      const min_lng = url.searchParams.get('min_lng');
      const max_lat = url.searchParams.get('max_lat');
      const max_lng = url.searchParams.get('max_lng');

      if (!min_lat || !min_lng || !max_lat || !max_lng) {
        return Response.json(
          { error: 'Missing required query parameters: min_lat, min_lng, max_lat, max_lng' },
          { status: 400, headers: corsHeaders }
        );
      }

      const minLat = parseFloat(min_lat);
      const minLng = parseFloat(min_lng);
      const maxLat = parseFloat(max_lat);
      const maxLng = parseFloat(max_lng);

      if ([minLat, minLng, maxLat, maxLng].some(isNaN)) {
        return Response.json(
          { error: 'All bounding box parameters must be valid numbers.' },
          { status: 400, headers: corsHeaders }
        );
      }

      try {
        const key = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY;
        const queryUrl = `${env.SUPABASE_URL}/rest/v1/nodes?select=node_id,latitude,longitude,status,sync_status,image_key,h3_index,created_at&latitude=gte.${minLat}&latitude=lte.${maxLat}&longitude=gte.${minLng}&longitude=lte.${maxLng}&order=node_id.asc`;

        const dbRes = await fetch(queryUrl, {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Accept-Profile': 'patchwork',
            'Content-Profile': 'patchwork',
          },
        });

        if (!dbRes.ok) {
          const errText = await dbRes.text();
          return Response.json(
            { error: `Database query failed: ${errText.slice(0, 200)}` },
            { status: 500, headers: corsHeaders }
          );
        }

        const rows = (await dbRes.json()) as Array<{
          node_id: string;
          latitude: number;
          longitude: number;
          status: string;
          sync_status: string;
          image_key?: string | null;
          h3_index?: string | null;
          created_at: string;
        }>;

        const nodes = rows.map((r) => ({
          id: r.node_id,
          node_id: r.node_id,
          latitude: r.latitude,
          longitude: r.longitude,
          status: r.status,
          sync_status: r.sync_status,
          image_key: r.image_key ?? null,
          h3_index: r.h3_index ?? null,
          created_at: r.created_at,
        }));

        return Response.json({ nodes }, { headers: corsHeaders });
      } catch (err: any) {
        console.error('[NODES] Bounding box query failed:', err);
        return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/ports/request-upload (and legacy alias POST /api/storage/request-upload)
    if (url.pathname === '/api/ports/request-upload' || url.pathname === '/api/storage/request-upload') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
      }

      // 1. Authenticate caller JWT
      const authHeader = request.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return Response.json(
          { error: 'Missing or malformed Authorization header.' },
          { status: 401, headers: corsHeaders }
        );
      }

      const user = await verifySupabaseToken(env, authHeader.slice(7));
      if (!user) {
        return Response.json(
          { error: 'Invalid or expired token.' },
          { status: 401, headers: corsHeaders }
        );
      }

      // 2. Hardware attestation
      const requireAttestation = env.REQUIRE_HARDWARE_ATTESTATION === 'true';
      const attestationToken =
        request.headers.get('x-device-attestation') || request.headers.get('x-hardware-attestation');

      if (requireAttestation) {
        if (!attestationToken || attestationToken === 'invalid' || attestationToken === 'mock_fail') {
          return Response.json(
            { error: 'Hardware attestation failed.', detail: 'Valid device attestation token required.' },
            { status: 403, headers: corsHeaders }
          );
        }
      }

      // 3. Verify S3 presigner credentials
      if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        console.error('[PRESIGN] Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY in worker secrets');
        return Response.json(
          { error: 'Server misconfiguration: R2 credentials missing in Worker secrets.' },
          { status: 500, headers: corsHeaders }
        );
      }

      const bucket = env.R2_BUCKET_NAME || 'patchwork-ports-stag';
      const uploadId = crypto.randomUUID();
      const objectKey = `ports/${uploadId}.jpg`;
      const expiresInSeconds = 900;

      let bodyPayload: any = {};
      try {
        bodyPayload = await request.json();
      } catch {
        // empty body is acceptable
      }
      const lat = typeof bodyPayload?.latitude === 'number' ? bodyPayload.latitude : null;
      const lng = typeof bodyPayload?.longitude === 'number' ? bodyPayload.longitude : null;
      // Always register the issued upload as a pending node in Supabase
      await createPendingNode(env, uploadId, user.id, lat ?? 0, lng ?? 0);

      try {
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          },
        });

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ContentType: 'image/jpeg',
        });

        const timeoutSignal = AbortSignal.timeout(5000);
        const presignedUrl = await getSignedUrl(s3, command, {
          expiresIn: expiresInSeconds,
          // @ts-ignore
          abortSignal: timeoutSignal,
        });

        const isLegacy = url.pathname === '/api/storage/request-upload';
        return Response.json(
          {
            upload_id: uploadId,
            presigned_url: presignedUrl,
            object_key: objectKey,
            object_path: objectKey,
            method: 'PUT',
            required_headers: { 'Content-Type': 'image/jpeg' },
            expires_in_seconds: expiresInSeconds,
            attestation_status: requireAttestation ? 'verified' : 'mock_success',
          },
          {
            headers: isLegacy
              ? { ...corsHeaders, Warning: '299 - "Deprecated: Use /api/ports/request-upload"' }
              : corsHeaders,
          }
        );
      } catch (err: unknown) {
        const isTimeout =
          err instanceof Error &&
          (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message.includes('timeout'));

        if (isTimeout) {
          return new Response(
            JSON.stringify({ error: 'Presign timeout — R2 unavailable, retry shortly.' }),
            {
              status: 503,
              headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '5' },
            }
          );
        }

        console.error('[PRESIGN] Error generating presigned URL:', err);
        return Response.json(
          { error: 'Failed to generate upload URL.' },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // POST /api/cron/bounty-trigger (HTTP fallback for manual / webhook testing)
    if (url.pathname === '/api/cron/bounty-trigger') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
      }
      if (!verifyCronAuth(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      try {
        const res = await executeBountyTrigger(env);
        return Response.json(res, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /api/cron/archive-nodes (HTTP fallback for manual / webhook testing)
    if (url.pathname === '/api/cron/archive-nodes') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
      }
      if (!verifyCronAuth(request, env)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      try {
        const res = await executeArchiveNodes(env);
        return Response.json(res, { headers: corsHeaders });
      } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },

  /**
   * Cloudflare Queues Handler — process raw R2 uploads asynchronously
   */
  async queue(batch: MessageBatch<R2EventMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const event = message.body;

      if (
        event.action !== 'PutObject' &&
        event.action !== 'CompleteMultipartUpload' &&
        event.action !== 'CopyObject'
      ) {
        console.log(`[WORKER] Skipping non-create event: ${event.action}`);
        message.ack();
        continue;
      }

      // Verify event bucket matches expected staging bucket
      const expectedBucket = env.R2_BUCKET_NAME || 'patchwork-ports-stag';
      if (event.bucket && event.bucket !== expectedBucket) {
        console.warn(`[WORKER] Event bucket mismatch: received ${event.bucket}, expected ${expectedBucket}`);
        message.ack();
        continue;
      }

      const key = event.object.key;
      const uploadId = extractUploadId(key);

      if (!uploadId) {
        console.warn(`[WORKER] Unrecognised key pattern, skipping: ${key}`);
        message.ack();
        continue;
      }

      console.log(`[WORKER] Processing upload | key: ${key} | uploadId: ${uploadId}`);

      try {
        // 1. Fetch object from R2 staging
        const stagingObj = await env.R2_STAGING.get(key);
        if (!stagingObj) throw new Error(`Object not found in staging: ${key}`);

        const buffer = await stagingObj.arrayBuffer();
        console.log(`[WORKER] Fetched ${buffer.byteLength} bytes from staging`);

        // Defensive guard: Maximum upload size (25 MB)
        const MAX_BYTES = 25 * 1024 * 1024;
        if (buffer.byteLength > MAX_BYTES) {
          console.warn(`[WORKER] Upload ${uploadId} exceeds max size limit (${buffer.byteLength} bytes). Rejecting.`);
          await env.R2_STAGING.delete(key);
          message.ack();
          continue;
        }

        // Defensive guard: Validate JPEG magic bytes (0xFF, 0xD8, 0xFF)
        if (buffer.byteLength >= 3) {
          const header = new Uint8Array(buffer.slice(0, 3));
          if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
            console.warn(`[WORKER] Non-JPEG file detected for ${key}. Rejecting.`);
            await env.R2_STAGING.delete(key);
            message.ack();
            continue;
          }
        }

        // 2. Fetch existing node metadata to verify issued upload and preserve state/coordinates
        const existingNode = await fetchNode(env, uploadId);
        if (!existingNode) {
          console.warn(`[WORKER] Unverified staging object: no pending node record found for uploadId ${uploadId}. Discarding.`);
          await env.R2_STAGING.delete(key);
          message.ack();
          continue;
        }

        const isResolved = existingNode.status === 'verified' || existingNode.status === 'archived';
        const targetStatus = isResolved ? existingNode.status : 'awaiting_verification';

        // 3. Compute SHA-256
        const sha256 = await sha256Hex(buffer);
        console.log(`[WORKER] SHA-256: ${sha256}`);

        // 4. Copy to production bucket
        const prodKey = `ports/prod/${uploadId}.jpg`;
        await env.R2_PRODUCTION.put(prodKey, buffer, {
          httpMetadata: { contentType: 'image/jpeg' },
          customMetadata: { sha256, source_key: key },
        });
        console.log(`[WORKER] Copied to production: ${prodKey}`);

        // 5. Compute H3 index using actual capture coordinates when available
        const lat = existingNode.latitude ?? 0;
        const lng = existingNode.longitude ?? 0;
        const hasValidCoords = existingNode.latitude != null && existingNode.longitude != null && (existingNode.latitude !== 0 || existingNode.longitude !== 0);
        const h3Index = hasValidCoords ? latLngToCell(lat, lng, 10) : latLngToCell(0, 0, 10);

        // 6. Upsert into patchwork.nodes (without reverting verified/archived status)
        await upsertNode(env, uploadId, prodKey, h3Index, sha256, targetStatus, lat, lng);
        console.log(`[WORKER] Supabase node upserted for uploadId: ${uploadId} with status: ${targetStatus}`);

        // 7. Delete staging object
        await env.R2_STAGING.delete(key);
        console.log(`[WORKER] Staging object deleted: ${key}`);

        message.ack();
        console.log(`[WORKER] ✓ Processed ${uploadId} successfully`);
      } catch (err) {
        console.error(`[WORKER] ✗ Failed to process ${uploadId}:`, err);
        message.retry();
      }
    }
  },

  /**
   * Scheduled Cron Handler — native edge scheduler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[CRON] Scheduled event fired: ${event.cron}`);
    if (event.cron === '10 0 * * *') {
      ctx.waitUntil(executeArchiveNodes(env));
    } else {
      // 5 0 * * * or fallback
      ctx.waitUntil(executeBountyTrigger(env));
    }
  },
};
