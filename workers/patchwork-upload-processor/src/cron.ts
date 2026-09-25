import type { Env } from './index';

// ---------------------------------------------------------------------------
// Lifecycle Action: Execute Bounty Trigger (7-day rule)
// ---------------------------------------------------------------------------
export async function executeBountyTrigger(
  env: Env
): Promise<{ ok: boolean; job: string; triggered: number; failed: number; skipped?: string }> {
  console.log('[CRON] executeBountyTrigger starting...');
  if (!env.WEBHOOK_URL || env.WEBHOOK_URL.includes('.local')) {
    console.warn('[CRON] WEBHOOK_URL is not configured or uses a placeholder domain; skipping bounty notifications.');
    return { ok: true, job: 'bounty-trigger', triggered: 0, failed: 0, skipped: 'WEBHOOK_URL not configured or placeholder' };
  }

  const webhookUrl = env.WEBHOOK_URL;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const BATCH_SIZE = 100;
  const MAX_PAGES = 10;

  let triggered = 0;
  let failed = 0;
  let page = 0;

  while (page < MAX_PAGES) {
    const offset = page * BATCH_SIZE;
    const queryUrl = `${env.SUPABASE_URL}/rest/v1/nodes?status=eq.awaiting_verification&bounty_triggered=eq.false&created_at=lt.${cutoff}&select=node_id,latitude,longitude,h3_index&order=node_id.asc&limit=${BATCH_SIZE}&offset=${offset}`;
    const fetchRes = await fetch(queryUrl, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Accept-Profile': 'patchwork',
        'Content-Profile': 'patchwork',
      },
    });

    if (!fetchRes.ok) {
      const errText = await fetchRes.text();
      throw new Error(`Failed to query eligible nodes: HTTP ${fetchRes.status} — ${errText}`);
    }

    const nodes = (await fetchRes.json()) as Array<{
      node_id: string;
      latitude: number;
      longitude: number;
      h3_index: string;
    }>;

    if (!nodes || nodes.length === 0) break;

    for (const node of nodes) {
      try {
        const webhookRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: node.node_id,
            h3_index: node.h3_index,
            latitude: node.latitude,
            longitude: node.longitude,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!webhookRes.ok) throw new Error(`Webhook HTTP ${webhookRes.status}`);

        // Mark bounty as triggered
        const patchUrl = `${env.SUPABASE_URL}/rest/v1/nodes?node_id=eq.${node.node_id}&bounty_triggered=eq.false`;
        const patchRes = await fetch(patchUrl, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Accept-Profile': 'patchwork',
            'Content-Profile': 'patchwork',
          },
          body: JSON.stringify({ bounty_triggered: true }),
        });

        if (!patchRes.ok) throw new Error(`DB update failed: HTTP ${patchRes.status}`);

        triggered++;
        console.log(`[CRON] Bounty triggered for node ${node.node_id}`);
      } catch (err) {
        failed++;
        console.error(`[CRON] Bounty trigger failed for node ${node.node_id}:`, err);
      }
    }

    if (nodes.length < BATCH_SIZE) break;
    page++;
  }

  console.log(`[CRON] executeBountyTrigger complete: ${triggered} triggered, ${failed} failed`);
  return { ok: true, job: 'bounty-trigger', triggered, failed };
}

// ---------------------------------------------------------------------------
// Lifecycle Action: Execute Archive Nodes (28-day rule)
// ---------------------------------------------------------------------------
export async function executeArchiveNodes(
  env: Env
): Promise<{ ok: boolean; job: string; archived: number }> {
  console.log('[CRON] executeArchiveNodes starting...');
  const cutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  const patchUrl = `${env.SUPABASE_URL}/rest/v1/nodes?status=eq.awaiting_verification&created_at=lt.${cutoff}`;
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=representation',
      'Accept-Profile': 'patchwork',
      'Content-Profile': 'patchwork',
    },
    body: JSON.stringify({ status: 'archived' }),
  });

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error(`Archive failed: HTTP ${patchRes.status} — ${errText}`);
  }

  const modified = (await patchRes.json()) as Array<{ node_id: string }>;
  const archived = Array.isArray(modified) ? modified.length : 0;
  console.log(`[CRON] executeArchiveNodes complete: ${archived} nodes archived`);
  return { ok: true, job: 'archive-nodes', archived };
}
