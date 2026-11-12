/**
 * Supabase Edge Function: patchwork-ad-dispatcher
 * File: supabase/functions/patchwork-ad-dispatcher/index.ts
 * Work Item: [TASK-PW-TRACKER-BRIDGE] (Parent: STORY-PW-PUBLIC-CATALOG / EPIC-PW-AD-AUDIT)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sunshade-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

async function computeHmacSha256(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchWithExponentialBackoff(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  initialDelayMs = 100
): Promise<Response> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const resp = await fetch(url, options);
      if (resp.status < 500 || attempt >= maxRetries) {
        return resp;
      }
    } catch (err) {
      if (attempt >= maxRetries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay *= 2;
  }
  throw new Error(`Failed to deliver payload to ${url}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Authenticate caller (require service role or internal dispatch key)
  const authHeader = req.headers.get("authorization") || "";
  const internalKey = req.headers.get("x-sunshade-internal-key") || "";
  const expectedSecret = Deno.env.get("INTERNAL_DISPATCH_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (expectedSecret && !authHeader.includes(expectedSecret) && internalKey !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized dispatch invocation" }, 401);
  }

  // 2. Validate HMAC signing secret
  const hmacSecret = Deno.env.get("SUNSHADE_HMAC_SECRET");
  if (!hmacSecret) {
    return jsonResponse({ error: "SUNSHADE_HMAC_SECRET is required but not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { node_id, h3_index_res8, parcel_id, latitude, longitude, unique_ports, inside_school_buffer, ocr_raw_text } = body;

    if (!node_id || !h3_index_res8) {
      return jsonResponse({ error: "Missing required node_id or h3_index_res8" }, 400);
    }

    const portCount = Number(unique_ports || 0);
    if (portCount < 3) {
      return jsonResponse({
        skipped: true,
        reason: `Threshold not reached: ${portCount} ports (requires >= 3)`,
      }, 200);
    }

    const trackerUrl = Deno.env.get("TRACKER_WEBHOOK_URL") || "https://track.sunshade.icu/api/v1/items/ingest";
    const valerieUrl = Deno.env.get("VALERIE_WEBHOOK_URL") || "https://valerie.sunshade.icu/api/v1/proposals/ingest";

    // Format Tracker Payload
    const trackerPayload = {
      project_slug: "sunshade-tracker",
      items: [
        {
          external_ref_id: `TASK-PW-REMEDIATE-${node_id}`,
          title: `Remediate Billboard Corridor Setback Breach [${parcel_id || node_id.substring(0, 8)}]`,
          description: `Community escalation triggered by ${portCount} unique user ports in corridor ${h3_index_res8}.`,
          item_type: "task",
          status: "not_started",
          metadata: {
            node_id,
            h3_index_res8,
            parcel_id: parcel_id || null,
            inside_school_buffer: Boolean(inside_school_buffer),
            port_count: portCount,
            source: "patchwork-ad-dispatcher",
          },
        },
      ],
    };

    const trackerBodyStr = JSON.stringify(trackerPayload);
    const trackerSig = await computeHmacSha256(trackerBodyStr, hmacSecret);

    // Format Valerie Payload
    const valeriePayload = {
      patchwork_port_id: `port-${node_id}`,
      parcel_id: parcel_id || `PARCEL-${node_id.substring(0, 8)}`,
      h3_index_res8,
      flagged_categories: inside_school_buffer
        ? ["SCHOOL_BUFFER_BREACH", "EXCESSIVE_LUMINANCE"]
        : ["CORRIDOR_EQUITY_DISPARITY", "TRAFFIC_SIGHTLINE_HAZARD"],
      ocr_raw_text: ocr_raw_text || "COMMERCIAL ADVERTISING CORRIDOR SIGNAGE",
      metadata: {
        node_id,
        latitude,
        longitude,
        port_count: portCount,
        inside_school_buffer: Boolean(inside_school_buffer),
      },
    };

    const valerieBodyStr = JSON.stringify(valeriePayload);
    const valerieSig = await computeHmacSha256(valerieBodyStr, hmacSecret);

    // Isolate outbound dispatches so one destination failure never halts the other
    let trackerResp: Response | null = null;
    let trackerErr: string | null = null;
    try {
      trackerResp = await fetchWithExponentialBackoff(trackerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SunShade-Signature": trackerSig,
        },
        body: trackerBodyStr,
      });
    } catch (err: any) {
      trackerErr = err.message || "Tracker delivery failed";
    }

    let valerieResp: Response | null = null;
    let valerieErr: string | null = null;
    try {
      valerieResp = await fetchWithExponentialBackoff(valerieUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SunShade-Signature": valerieSig,
        },
        body: valerieBodyStr,
      });
    } catch (err: any) {
      valerieErr = err.message || "Valerie delivery failed";
    }

    const trackerSuccess = Boolean(trackerResp && trackerResp.ok);
    const valerieSuccess = Boolean(valerieResp && valerieResp.ok);
    const allSuccess = trackerSuccess && valerieSuccess;

    return jsonResponse({
      success: allSuccess,
      node_id,
      tracker: {
        success: trackerSuccess,
        status: trackerResp?.status || null,
        error: trackerErr || (!trackerSuccess ? `HTTP ${trackerResp?.status}` : null),
      },
      valerie: {
        success: valerieSuccess,
        status: valerieResp?.status || null,
        error: valerieErr || (!valerieSuccess ? `HTTP ${valerieResp?.status}` : null),
      },
    }, allSuccess ? 200 : 207);
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Dispatcher internal error" }, 500);
  }
});
