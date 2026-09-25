/**
 * index.test.ts
 *
 * Comprehensive unit tests for the Unified Cloudflare Worker (PTW-11):
 * - HTTP Fetch Handler (health check, JWT auth, R2 S3-presigned PUT URL, cron webhooks)
 * - Cloudflare Queues Consumer (R2 staging fetch, SHA-256 hash, R2 prod copy, H3 index, Supabase upsert, staging cleanup)
 * - Cloudflare Scheduled Cron Triggers (bounty-trigger at 00:05 UTC, archive-nodes at 00:10 UTC)
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

const mockGetSignedUrl = vi.fn();
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function () {
    return {};
  }),
  PutObjectCommand: vi.fn().mockImplementation(function (args: unknown) {
    return args;
  }),
}));

import worker, { executeBountyTrigger, executeArchiveNodes } from './index';

const UPLOAD_ID = 'e171a48f-847c-48fb-8103-8a11ee5c721f';
const KEY = `ports/${UPLOAD_ID}.jpg`;
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

function makeEnv(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    R2_STAGING: {
      get: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    R2_PRODUCTION: {
      put: vi.fn().mockResolvedValue(undefined),
    },
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET_NAME: 'patchwork-ports-stag',
    CRON_SECRET: 'test-cron-secret',
    WEBHOOK_URL: 'https://api.patchwork.org/webhook/critter-bounty',
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    body: {
      action: 'PutObject',
      object: {
        key: KEY,
        size: IMAGE_BYTES.byteLength,
        etag: 'mock-etag-abc',
      },
      account: 'test-account',
      bucket: 'patchwork-ports-stag',
    },
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. HTTP Fetch Handler Tests (PTW-11)
// ---------------------------------------------------------------------------
describe('Worker HTTP Fetch Handler (worker.fetch)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns 200 with status ok and timestamp', async () => {
    const req = new Request('https://worker.test/health');
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const req = new Request('https://worker.test/api/ports/request-upload', { method: 'OPTIONS' });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('POST /api/ports/request-upload returns 401 when Authorization header is missing', async () => {
    const req = new Request('https://worker.test/api/ports/request-upload', { method: 'POST' });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Authorization');
  });

  it('POST /api/ports/request-upload returns 401 when Supabase token verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid token' }),
    }));

    const req = new Request('https://worker.test/api/ports/request-upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid-token' },
    });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(401);
  });

  it('POST /api/ports/request-upload returns 200 with presigned PUT URL and upload payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'usr-123' }),
    }));

    mockGetSignedUrl.mockResolvedValue(
      'https://patchwork-ports-stag.test-account-id.r2.cloudflarestorage.com/ports/test.jpg?X-Amz-Signature=abc'
    );

    const req = new Request('https://worker.test/api/ports/request-upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt-token' },
    });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.upload_id).toBeDefined();
    expect(body.presigned_url).toContain('r2.cloudflarestorage.com');
    expect(body.method).toBe('PUT');
    expect(body.object_key).toMatch(/^ports\/[0-9a-f-]+\.jpg$/);
    expect(body.required_headers['Content-Type']).toBe('image/jpeg');
    expect(body.expires_in_seconds).toBe(900);
    expect(body.attestation_status).toBe('mock_success');
  });

  it('POST /api/ports/request-upload rejects with 403 when REQUIRE_HARDWARE_ATTESTATION is true and attestation header is missing or invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'usr-123' }),
    }));

    const req = new Request('https://worker.test/api/ports/request-upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt-token' },
    });
    const env = makeEnv({ REQUIRE_HARDWARE_ATTESTATION: 'true' });
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Hardware attestation');
  });

  it('POST /api/ports/request-upload accepts with verified attestation when token is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'usr-123' }),
    }));

    mockGetSignedUrl.mockResolvedValue(
      'https://patchwork-ports-stag.test-account-id.r2.cloudflarestorage.com/ports/test.jpg?X-Amz-Signature=abc'
    );

    const req = new Request('https://worker.test/api/ports/request-upload', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid-jwt-token',
        'x-device-attestation': 'valid-device-proof-abc',
      },
    });
    const env = makeEnv({ REQUIRE_HARDWARE_ATTESTATION: 'true' });
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.attestation_status).toBe('verified');
  });

  it('POST /api/cron/bounty-trigger rejects without Bearer CRON_SECRET', async () => {
    const req = new Request('https://worker.test/api/cron/bounty-trigger', { method: 'POST' });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);
    expect(res.status).toBe(401);
  });

  it('POST /api/cron/bounty-trigger executes successfully when authorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [],
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    }));

    const req = new Request('https://worker.test/api/cron/bounty-trigger', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.job).toBe('bounty-trigger');
  });

  it('POST /api/cron/archive-nodes executes successfully when authorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ node_id: 'node-archived-1' }],
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    }));

    const req = new Request('https://worker.test/api/cron/archive-nodes', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.job).toBe('archive-nodes');
    expect(body.archived).toBe(1);
  });

  it('GET /api/nodes returns 400 when bounding box query parameters are missing or invalid', async () => {
    const req = new Request('https://worker.test/api/nodes?min_lat=abc', { method: 'GET' });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toMatch(/parameters|bounding box/i);
  });

  it('GET /api/nodes returns 200 with bounding box nodes from Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              node_id: 'node-box-1',
              latitude: 40.7128,
              longitude: -74.006,
              status: 'awaiting_verification',
              sync_status: 'synced',
              image_key: 'ports/prod/box-1.jpg',
              h3_index: '8a2a1072b59ffff',
              created_at: '2026-09-25T00:00:00.000Z',
            },
          ],
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    }));

    const req = new Request('https://worker.test/api/nodes?min_lat=40.0&min_lng=-75.0&max_lat=41.0&max_lng=-73.0', { method: 'GET' });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].id).toBe('node-box-1');
    expect(body.nodes[0].latitude).toBe(40.7128);
  });

  it('POST /api/storage/request-upload returns 200 with legacy response shape and Warning header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'usr-123' }),
    }));

    mockGetSignedUrl.mockResolvedValue(
      'https://patchwork-ports-stag.test-account-id.r2.cloudflarestorage.com/ports/test.jpg?X-Amz-Signature=abc'
    );

    const req = new Request('https://worker.test/api/storage/request-upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-jwt-token' },
    });
    const env = makeEnv();
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    expect(res.headers.get('Warning')).toContain('Deprecated');
    const body = (await res.json()) as any;
    expect(body.upload_id).toBeDefined();
    expect(body.object_path).toBeDefined();
    expect(body.object_key).toBeDefined();
  });

  it('OPTIONS respects ALLOWED_ORIGINS whitelist', async () => {
    const env = makeEnv({ ALLOWED_ORIGINS: 'https://patchwork.app,http://localhost:8081' });
    const req = new Request('https://worker.test/api/ports/request-upload', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:8081' },
    });
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');
  });

  it('POST /api/cron/bounty-trigger returns skipped message when WEBHOOK_URL is not set', async () => {
    const req = new Request('https://worker.test/api/cron/bounty-trigger', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const env = makeEnv({ WEBHOOK_URL: undefined });
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.skipped).toContain('WEBHOOK_URL');
  });

  it('POST /api/cron/bounty-trigger returns skipped message when WEBHOOK_URL contains .local placeholder', async () => {
    const req = new Request('https://worker.test/api/cron/bounty-trigger', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const env = makeEnv({ WEBHOOK_URL: 'https://api.patchwork.local/webhook/critter-bounty' });
    const res = await worker.fetch(req, env as any);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.skipped).toContain('placeholder');
  });
});

// ---------------------------------------------------------------------------
// 2. Cloudflare Queues Consumer Tests (worker.queue)
// ---------------------------------------------------------------------------
describe('Worker Queue Consumer (worker.queue)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: fetches staging, hashes, copies to prod, upserts Supabase, deletes staging, acks', async () => {
    const env = makeEnv();
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(IMAGE_BYTES.buffer),
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes?node_id=eq.')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ node_id: UPLOAD_ID, status: 'pending', latitude: 40.7128, longitude: -74.006 }],
          text: async () => '',
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({}),
      });
    }));

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(env.R2_STAGING.get).toHaveBeenCalledWith(KEY);
    expect(env.R2_PRODUCTION.put).toHaveBeenCalledWith(
      `ports/prod/${UPLOAD_ID}.jpg`,
      IMAGE_BYTES.buffer,
      expect.objectContaining({ httpMetadata: { contentType: 'image/jpeg' } })
    );
    expect(env.R2_STAGING.delete).toHaveBeenCalledWith(KEY);
    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('discards unverified staging uploads when no pending node exists', async () => {
    const env = makeEnv();
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(IMAGE_BYTES.buffer),
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
      text: async () => '',
    }));

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(env.R2_STAGING.delete).toHaveBeenCalledWith(KEY);
    expect(env.R2_PRODUCTION.put).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('rejects and deletes uploads exceeding max size limit (25MB)', async () => {
    const env = makeEnv();
    const oversizedBuffer = new Uint8Array(26 * 1024 * 1024);
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(oversizedBuffer.buffer),
    });

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(env.R2_STAGING.delete).toHaveBeenCalledWith(KEY);
    expect(env.R2_PRODUCTION.put).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('rejects and deletes non-JPEG uploads', async () => {
    const env = makeEnv();
    const nonJpegBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(nonJpegBuffer.buffer),
    });

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(env.R2_STAGING.delete).toHaveBeenCalledWith(KEY);
    expect(env.R2_PRODUCTION.put).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('preserves verified status on retry without reverting to awaiting_verification', async () => {
    const env = makeEnv();
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(IMAGE_BYTES.buffer),
    });

    let upsertPayload: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: any) => {
      if (url.includes('/rest/v1/nodes?node_id=eq.')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ node_id: UPLOAD_ID, status: 'verified', latitude: 40.7128, longitude: -74.006 }],
          text: async () => '',
        });
      }
      if (opts?.method === 'POST') {
        upsertPayload = JSON.parse(opts.body);
        return Promise.resolve({ ok: true, status: 200, text: async () => '' });
      }
      return Promise.resolve({ ok: true, status: 200 });
    }));

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(upsertPayload).toBeDefined();
    expect(upsertPayload.status).toBe('verified');
    expect(msg.ack).toHaveBeenCalledTimes(1);
  });

  it('skips events from mismatched buckets', async () => {
    const env = makeEnv();
    const msg = makeMessage({
      body: {
        action: 'PutObject',
        object: { key: KEY, size: IMAGE_BYTES.byteLength, etag: 'x' },
        account: 'test',
        bucket: 'some-other-bucket',
      },
    });
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(env.R2_STAGING.get).not.toHaveBeenCalled();
  });

  it('nacks (retries) when staging object is missing', async () => {
    const env = makeEnv();
    (env.R2_STAGING.get as Mock).mockResolvedValue(null);

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    expect(env.R2_STAGING.delete).not.toHaveBeenCalled();
  });

  it('nacks when Supabase upsert fails', async () => {
    const env = makeEnv();
    (env.R2_STAGING.get as Mock).mockResolvedValue({
      arrayBuffer: vi.fn().mockResolvedValue(IMAGE_BYTES.buffer),
    });

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes?node_id=eq.')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ node_id: UPLOAD_ID, status: 'pending', latitude: 40.7128, longitude: -74.006 }],
          text: async () => '',
        });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });
    }));

    const msg = makeMessage();
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(msg.retry).toHaveBeenCalledTimes(1);
    expect(msg.ack).not.toHaveBeenCalled();
    expect(env.R2_STAGING.delete).not.toHaveBeenCalled();
  });

  it('acks and skips non-create events', async () => {
    const env = makeEnv();
    const msg = makeMessage({
      body: {
        action: 'DeleteObject',
        object: { key: KEY, size: 0, etag: '' },
        account: 'test',
        bucket: 'stag',
      },
    });
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(env.R2_STAGING.get).not.toHaveBeenCalled();
  });

  it('acks and skips unrecognised key patterns', async () => {
    const env = makeEnv();
    const msg = makeMessage({
      body: {
        action: 'PutObject',
        object: { key: 'invalid/format.txt', size: 10, etag: 'x' },
        account: 'test',
        bucket: 'stag',
      },
    });
    const batch = { messages: [msg] };

    await worker.queue(batch as any, env as any);

    expect(msg.ack).toHaveBeenCalledTimes(1);
    expect(env.R2_STAGING.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Native Scheduled Cron Trigger Tests (worker.scheduled)
// ---------------------------------------------------------------------------
describe('Worker Scheduled Handler (worker.scheduled)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const env = makeEnv();

  it('triggers bounty-trigger for cron 5 0 * * * and executes webhook & patch', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, options: any) => {
      if (url.includes('/rest/v1/nodes') && !options?.method) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              node_id: 'bounty-node-1',
              latitude: 40.7128,
              longitude: -74.006,
              h3_index: '8a2a1072b59ffff',
            },
          ],
        });
      }
      if (url.includes('/webhook/critter-bounty')) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      if (url.includes('/rest/v1/nodes') && options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    let waitedPromise: Promise<any> | null = null;
    const ctx = {
      waitUntil: vi.fn((p: Promise<any>) => {
        waitedPromise = p;
      }),
    };
    const event = { cron: '5 0 * * *', type: 'scheduled', scheduledTime: Date.now() };

    await worker.scheduled(event as any, env as any, ctx as any);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

    const result = await waitedPromise;
    expect(result).toEqual({ ok: true, job: 'bounty-trigger', triggered: 1, failed: 0 });

    const webhookCall = fetchMock.mock.calls.find((c) => c[0].includes('/webhook/critter-bounty'));
    expect(webhookCall).toBeDefined();
    expect(JSON.parse(webhookCall![1].body)).toEqual({
      node_id: 'bounty-node-1',
      h3_index: '8a2a1072b59ffff',
      latitude: 40.7128,
      longitude: -74.006,
    });
  });

  it('triggers archive-nodes for cron 10 0 * * * and executes patch', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/rest/v1/nodes')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ node_id: 'archived-node-1' }],
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    let waitedPromise: Promise<any> | null = null;
    const ctx = {
      waitUntil: vi.fn((p: Promise<any>) => {
        waitedPromise = p;
      }),
    };
    const event = { cron: '10 0 * * *', type: 'scheduled', scheduledTime: Date.now() };

    await worker.scheduled(event as any, env as any, ctx as any);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

    const result = await waitedPromise;
    expect(result).toEqual({ ok: true, job: 'archive-nodes', archived: 1 });
  });
});
