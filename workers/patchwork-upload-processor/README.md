# PatchWork Upload Processor & Unified Edge Worker

Consolidated Cloudflare Worker replacing the retired Render backend and AWS Lambda functions (PTW-11).

## Architecture & Responsibilities

1. **HTTP API (`fetch`)**:
   - `GET /health`: Health probe returning service status and UTC timestamp.
   - `GET /api/nodes?min_lat=&min_lng=&max_lat=&max_lng=`: Spatial bounding-box query against `patchwork.nodes` in Supabase.
   - `POST /api/ports/request-upload`: Authenticates caller JWT with Supabase, issues Cloudflare R2 S3-presigned PUT URL (`ports/<uploadId>.jpg`, 15-minute expiration, 5s timeout guard).
   - `POST /api/storage/request-upload`: Backward-compatibility alias for legacy mobile clients.
   - `POST /api/cron/bounty-trigger`: HTTP fallback trigger for 7-day critter bounty sweep (`Authorization: Bearer <CRON_SECRET>`).
   - `POST /api/cron/archive-nodes`: HTTP fallback trigger for 28-day soft-archive sweep (`Authorization: Bearer <CRON_SECRET>`).

2. **Cloudflare Queues Consumer (`queue`)**:
   - Listens to `patchwork-upload-queue` notifications from R2 staging bucket (`patchwork-ports-stag`).
   - Fetches uploaded image buffer from staging.
   - Computes SHA-256 fingerprint via the Web Crypto API (`crypto.subtle.digest`).
   - Copies image to production R2 bucket (`patchwork-ports`) at `ports/prod/<uploadId>.jpg`.
   - Generates Uber H3 index at resolution 10.
   - Upserts node into `patchwork.nodes` in Supabase with `status: 'awaiting_verification'` and `sync_status: 'synced'`.
   - Deletes staging object to prevent storage bloat.

3. **Cloudflare Scheduled Cron Triggers (`scheduled`)**:
   - `5 0 * * *` (00:05 UTC): Daily critter bounty sweep. Paginates through nodes in `awaiting_verification` older than 7 days, dispatches webhook to `WEBHOOK_URL`, and marks `bounty_triggered: true`.
   - `10 0 * * *` (00:10 UTC): Daily soft-archive sweep. Marks `awaiting_verification` nodes older than 28 days as `status: 'archived'`.

---

## Configuration & Environment Variables

### Wrangler Variables (`[vars]` in `wrangler.toml`)
- `R2_BUCKET_NAME`: Default staging bucket name (`patchwork-ports-stag`).
- `WEBHOOK_URL`: Target URL for the critter bounty webhook.
- `ALLOWED_ORIGINS`: Allowed CORS origins for web clients (`*` or comma-separated list e.g. `https://patchwork.app,http://localhost:8081`).

### Wrangler Secrets (`wrangler secret put <NAME>`)
Configure these secrets in Cloudflare for production:
```sh
cd workers/patchwork-upload-processor
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put CRON_SECRET
```

---

## Local Development & Testing

```sh
# Run worker test suite
npm run worker:test  # (from repository root)
# or
npm test             # (inside workers/patchwork-upload-processor)

# Typecheck worker
npm run typecheck    # (inside workers/patchwork-upload-processor)

# Local dev server
npm run dev
```

## Deployment

Deploy the worker to Cloudflare:
```sh
npm run worker:deploy  # (from repository root)
# or
npm run deploy         # (inside workers/patchwork-upload-processor)
```
