/**
 * test-s3.ts
 *
 * End-to-end test for the S3 presigned upload pipeline:
 *   1. Generate a dummy file in memory
 *   2. SHA-256 hash it (hex)
 *   3. POST to /api/ports/request-upload → receive presigned URL
 *   4. PUT the file to S3 using the presigned URL + required headers
 *   5. Report success / failure with full diagnostic output
 *
 * Usage:
 *   npx ts-node test-s3.ts
 *
 * Requires the Express server to be running on localhost:3000 and valid
 * AWS credentials in .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).
 */

import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const SERVER = 'http://localhost:3000';

// ─── Step 1: Generate a dummy file ───────────────────────────────────────────
function createDummyFile(): Buffer {
  const content = [
    'PatchWork S3 Pipeline Test',
    `Timestamp : ${new Date().toISOString()}`,
    `Random    : ${crypto.randomBytes(16).toString('hex')}`,
    'This is a dummy payload used to verify the checksum-enforced upload pipeline.',
  ].join('\n');
  return Buffer.from(content, 'utf8');
}

// ─── Step 2: SHA-256 hash (hex) ───────────────────────────────────────────────
function sha256Hex(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PatchWork — S3 Presigned Upload Pipeline Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // Step 1 — create payload
  const fileBuffer = createDummyFile();
  console.log(`[1] Dummy file created (${fileBuffer.byteLength} bytes)`);
  console.log(`    Content:\n${fileBuffer.toString('utf8').split('\n').map(l => '    ' + l).join('\n')}\n`);

  // Step 2 — hash it
  const imageHash = sha256Hex(fileBuffer);
  // S3 ChecksumSHA256 header uses base64 of the raw hash bytes
  const checksumBase64 = Buffer.from(imageHash, 'hex').toString('base64');
  console.log(`[2] SHA-256 (hex)   : ${imageHash}`);
  console.log(`    SHA-256 (base64): ${checksumBase64}\n`);

  // Step 3 — request presigned URL from our API
  console.log(`[3] Requesting presigned URL from ${SERVER}/api/ports/request-upload ...`);
  let presignedUrl: string;
  let objectKey: string;
  let requiredHeaders: Record<string, string>;

  try {
    const { data } = await axios.post(`${SERVER}/api/ports/request-upload`, { image_hash: imageHash });
    presignedUrl = data.presigned_url;
    objectKey = data.object_key;
    requiredHeaders = data.required_headers;

    console.log(`    ✓ upload_id     : ${data.upload_id}`);
    console.log(`    ✓ object_key    : ${objectKey}`);
    console.log(`    ✓ expires_in    : ${data.expires_in_seconds}s`);
    console.log(`    ✓ attestation   : ${data.attestation_status}`);
    console.log(`    ✓ presigned_url : ${presignedUrl.slice(0, 120)}...`);
    console.log(`    ✓ required_headers:`);
    for (const [k, v] of Object.entries(requiredHeaders)) {
      console.log(`        ${k}: ${v}`);
    }
    console.log();
  } catch (err) {
    const e = err as AxiosError;
    console.error('    ✗ Failed to get presigned URL');
    console.error('      Status :', e.response?.status);
    console.error('      Body   :', JSON.stringify(e.response?.data, null, 2));
    process.exit(1);
  }

  // Step 4 — PUT the file directly to S3
  console.log(`[4] Uploading file to S3 via presigned URL ...`);
  console.log(`    Headers being sent:`);
  console.log(`        Content-Type          : image/jpeg`);
  console.log(`        x-amz-checksum-sha256 : ${checksumBase64}`);
  console.log(`        Content-Length        : ${fileBuffer.byteLength}`);
  console.log();

  try {
    const s3Response = await axios.put(presignedUrl, fileBuffer, {
      headers: {
        'Content-Type': requiredHeaders['Content-Type'] ?? 'image/jpeg',
        // CRITICAL: must match the value embedded in the presigned URL signature.
        // S3 rejects the request if this is absent or doesn't match the body hash.
        'x-amz-checksum-sha256': requiredHeaders['x-amz-checksum-sha256'],
        'Content-Length': fileBuffer.byteLength,
      },
      // Don't let axios transform the buffer
      transformRequest: [(data) => data],
      maxBodyLength: Infinity,
    });

    console.log(`    ✓ S3 Response Status : ${s3Response.status} ${s3Response.statusText}`);
    console.log(`    ✓ ETag               : ${s3Response.headers['etag'] ?? '(not returned)'}`);
    console.log(`    ✓ Object URL         : https://${process.env.AWS_S3_BUCKET ?? 'patchwork-macro-ports'}.s3.${process.env.AWS_REGION ?? 'us-east-1'}.amazonaws.com/${objectKey}`);
    console.log();
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RESULT: ✓ PASS — File uploaded successfully to S3');
    console.log('  The x-amz-checksum-sha256 header was verified by S3.');
    console.log('═══════════════════════════════════════════════════════');
  } catch (err) {
    const e = err as AxiosError;
    console.error(`    ✗ S3 PUT failed`);
    console.error(`      Status  : ${e.response?.status} ${e.response?.statusText}`);
    // S3 returns XML error bodies
    const body = e.response?.data;
    console.error(`      Body    : ${typeof body === 'string' ? body.slice(0, 800) : JSON.stringify(body)}`);
    console.log();
    console.log('═══════════════════════════════════════════════════════');
    console.log('  RESULT: ✗ FAIL — See error above');
    console.log('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
})();
