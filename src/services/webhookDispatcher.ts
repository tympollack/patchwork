/**
 * PatchWork Cross-Ecosystem Webhook Dispatcher
 * File: src/services/webhookDispatcher.ts (and supabase/functions/patchwork-ad-dispatcher/index.ts)
 * Work Item: [TASK-PW-TRACKER-BRIDGE] (Parent: STORY-PW-PUBLIC-CATALOG / EPIC-PW-AD-AUDIT)
 */

import crypto from 'crypto';

export interface AdAuditNodeData {
  node_id: string;
  h3_index_res8: string;
  parcel_id?: string;
  latitude: number;
  longitude: number;
  unique_user_ports: number | string[];
  inside_school_buffer?: boolean;
  ocr_raw_text?: string;
  flagged_categories?: string[];
  created_at?: string | number;
}

export interface DispatcherConfig {
  trackerUrl?: string;
  valerieUrl?: string;
  sharedHmacSecret?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  fetchFn?: typeof fetch;
}

export interface DispatchResult {
  nodeId: string;
  trackerSuccess: boolean;
  valerieSuccess: boolean;
  trackerStatus?: number;
  valerieStatus?: number;
  skippedDuplicate?: boolean;
  error?: string;
}

export interface DestinationDeliveryStatus {
  tracker: boolean;
  valerie: boolean;
  trackerStatus?: number;
  valerieStatus?: number;
}

// In-memory per-destination idempotency cache
const dispatchedNodesState = new Map<string, DestinationDeliveryStatus>();

export function resetDispatcherCache(): void {
  dispatchedNodesState.clear();
}

/**
 * Sign payload using HMAC-SHA256
 */
export function signHmacPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Outbound fetch with exponential backoff on 5xx server errors
 */
export async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  maxRetries: number = 3,
  initialBackoffMs: number = 100,
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  let attempt = 0;
  let delay = initialBackoffMs;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const response = await fetchFn(url, options);

      // If success or client error (4xx), do not retry 5xx
      if (response.status < 500 || attempt >= maxRetries) {
        return response;
      }
    } catch (err) {
      if (attempt >= maxRetries) {
        throw err;
      }
    }

    // Exponential backoff delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
  }

  throw new Error(`Failed to deliver request to ${url} after ${maxRetries} attempts`);
}

/**
 * Dispatch cross-ecosystem webhooks to Tracker and Valerie
 * when an ad audit node reaches threshold (>= 3 unique user ports)
 */
export async function dispatchAdThresholdWebhook(
  node: AdAuditNodeData,
  config: DispatcherConfig = {}
): Promise<DispatchResult> {
  const {
    trackerUrl = process.env.TRACKER_WEBHOOK_URL || 'https://track.sunshade.icu/api/v1/items/ingest',
    valerieUrl = process.env.VALERIE_WEBHOOK_URL || 'https://valerie.sunshade.icu/api/v1/proposals/ingest',
    sharedHmacSecret = process.env.SUNSHADE_HMAC_SECRET,
    maxRetries = 3,
    initialBackoffMs = 50,
    fetchFn = fetch,
  } = config;

  // 1. Threshold check: must have >= 3 unique user ports
  const userPortCount = Array.isArray(node.unique_user_ports)
    ? new Set(node.unique_user_ports).size
    : Number(node.unique_user_ports || 0);

  if (userPortCount < 3) {
    return {
      nodeId: node.node_id,
      trackerSuccess: false,
      valerieSuccess: false,
      error: `Threshold not reached: ${userPortCount} ports (minimum 3 required)`,
    };
  }

  // 2. Enforce HMAC secret requirement to prevent unauthenticated/forged webhook dispatches
  if (!sharedHmacSecret) {
    return {
      nodeId: node.node_id,
      trackerSuccess: false,
      valerieSuccess: false,
      error: 'SUNSHADE_HMAC_SECRET environment variable or config.sharedHmacSecret is required for webhook signing',
    };
  }

  // 2. Idempotency guard: if both destinations already succeeded, skip duplicate delivery
  const cached = dispatchedNodesState.get(node.node_id);
  if (cached && cached.tracker && cached.valerie) {
    return {
      nodeId: node.node_id,
      trackerSuccess: true,
      valerieSuccess: true,
      trackerStatus: cached.trackerStatus,
      valerieStatus: cached.valerieStatus,
      skippedDuplicate: true,
    };
  }

  // 3. Format Tracker Ingest Payload (creates task under sunshade-tracker)
  const trackerPayloadObj = {
    project_slug: 'sunshade-tracker',
    items: [
      {
        external_ref_id: `TASK-PW-REMEDIATE-${node.node_id}`,
        title: `Remediate Billboard Corridor Setback Breach [${node.parcel_id || node.node_id.substring(0, 8)}]`,
        description: `Community escalation triggered by ${userPortCount} unique verified sightlines in H3 corridor ${node.h3_index_res8}. Coordinates: ${node.latitude}, ${node.longitude}.`,
        item_type: 'task',
        status: 'not_started',
        metadata: {
          node_id: node.node_id,
          h3_index_res8: node.h3_index_res8,
          parcel_id: node.parcel_id || null,
          inside_school_buffer: Boolean(node.inside_school_buffer),
          port_count: userPortCount,
          source: 'patchwork-ad-dispatcher',
        },
      },
    ],
  };

  const trackerBodyStr = JSON.stringify(trackerPayloadObj);
  const trackerSignature = signHmacPayload(trackerBodyStr, sharedHmacSecret);

  // 4. Format Valerie Proposal Ingest Payload
  const defaultCategories = node.inside_school_buffer
    ? ['SCHOOL_BUFFER_BREACH', 'EXCESSIVE_LUMINANCE']
    : ['CORRIDOR_EQUITY_DISPARITY', 'TRAFFIC_SIGHTLINE_HAZARD'];

  const valeriePayloadObj = {
    patchwork_port_id: `port-${node.node_id}`,
    parcel_id: node.parcel_id || `PARCEL-${node.node_id.substring(0, 8)}`,
    h3_index_res8: node.h3_index_res8,
    flagged_categories: node.flagged_categories || defaultCategories,
    ocr_raw_text: node.ocr_raw_text || 'COMMERCIAL ADVERTISING CORRIDOR SIGNAGE',
    metadata: {
      node_id: node.node_id,
      latitude: node.latitude,
      longitude: node.longitude,
      unique_ports_count: userPortCount,
      inside_school_buffer: Boolean(node.inside_school_buffer),
      dispatched_at: new Date().toISOString(),
    },
  };

  const valerieBodyStr = JSON.stringify(valeriePayloadObj);
  const valerieSignature = signHmacPayload(valerieBodyStr, sharedHmacSecret);

  // 5. Execute HTTP requests with HMAC signatures and exponential retry
  // Only invoke destinations that haven't succeeded yet
  let trackerSuccess = cached?.tracker || false;
  let trackerStatus = cached?.trackerStatus;

  if (!trackerSuccess) {
    try {
      const trackerRes = await fetchWithBackoff(
        trackerUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SunShade-Signature': trackerSignature,
          },
          body: trackerBodyStr,
        },
        maxRetries,
        initialBackoffMs,
        fetchFn
      );
      trackerStatus = trackerRes.status;
      trackerSuccess = trackerRes.ok;
    } catch (err: any) {
      trackerSuccess = false;
    }
  }

  let valerieSuccess = cached?.valerie || false;
  let valerieStatus = cached?.valerieStatus;

  if (!valerieSuccess) {
    try {
      const valerieRes = await fetchWithBackoff(
        valerieUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-SunShade-Signature': valerieSignature,
          },
          body: valerieBodyStr,
        },
        maxRetries,
        initialBackoffMs,
        fetchFn
      );
      valerieStatus = valerieRes.status;
      valerieSuccess = valerieRes.ok;
    } catch (err: any) {
      valerieSuccess = false;
    }
  }

  // Update per-destination idempotency state
  dispatchedNodesState.set(node.node_id, {
    tracker: trackerSuccess,
    valerie: valerieSuccess,
    trackerStatus,
    valerieStatus,
  });

  return {
    nodeId: node.node_id,
    trackerSuccess,
    valerieSuccess,
    trackerStatus,
    valerieStatus,
  };
}
