import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = Router();

const BUCKET = 'patchwork-macro-ports';
const URL_EXPIRES_SECONDS = 900; // 15 minutes

// S3 client — credentials are sourced from standard AWS environment variables:
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
// Instantiated lazily (inside the handler) so that dotenv in index.ts has
// already populated process.env before the client reads the credentials.
function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
  });
}

/**
 * POST /api/ports/request-upload
 * Body: { image_hash: string }  — SHA-256 hex digest of the image to be uploaded
 *
 * Returns a real AWS S3 presigned PUT URL. The SHA-256 checksum is embedded
 * into the URL's Signature by listing `x-amz-checksum-sha256` as a signed
 * header. S3 will reject any PUT whose actual body hash doesn't match.
 */
router.post('/request-upload', async (req: Request, res: Response): Promise<void> => {
  const { image_hash } = req.body as { image_hash?: string };

  if (!image_hash) {
    res.status(400).json({ error: 'image_hash is required.' });
    return;
  }

  // Validate SHA-256 hex string (64 hex chars)
  if (!/^[a-f0-9]{64}$/i.test(image_hash)) {
    res.status(400).json({
      error: 'image_hash must be a valid SHA-256 hex digest (64 hex characters).',
    });
    return;
  }

  // Hardware attestation (mocked as successful for MVP)
  const attestation = mockHardwareAttestation();
  if (!attestation.success) {
    res.status(403).json({ error: 'Hardware attestation failed.', detail: attestation.reason });
    return;
  }

  const uploadId = crypto.randomUUID();
  const objectKey = `ports/${uploadId}/${image_hash}.jpg`;

  // Convert hex SHA-256 → base64 (S3 checksum header format)
  const checksumBase64 = Buffer.from(image_hash, 'hex').toString('base64');

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: objectKey,
    ContentType: 'image/jpeg',
    // CRITICAL: including ChecksumSHA256 here causes the presigner to add
    // `x-amz-checksum-sha256` to the list of signed headers. S3 will then
    // cryptographically verify that the header value matches the uploaded
    // body on arrival — any tampered payload is rejected with a 400.
    ChecksumSHA256: checksumBase64,
  });

  try {
    const presignedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: URL_EXPIRES_SECONDS,
      // unhoistableHeaders prevents the SDK from moving x-amz-checksum-sha256
      // out of the signed headers and into query params. It stays as a required
      // header — S3 will reject any PUT where the header is absent or its value
      // doesn't cryptographically match the uploaded body.
      unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
    });

    res.status(200).json({
      upload_id: uploadId,
      presigned_url: presignedUrl,
      object_key: objectKey,
      method: 'PUT',
      required_headers: {
        // The client MUST send this header with exactly this value.
        // S3 rejects the upload if header is absent or the hash doesn't match the body.
        'x-amz-checksum-sha256': checksumBase64,
        'Content-Type': 'image/jpeg',
      },
      expires_in_seconds: URL_EXPIRES_SECONDS,
      attestation_status: 'mock_success',
    });
  } catch (err) {
    console.error('Failed to generate presigned URL:', err);
    res.status(500).json({ error: 'Failed to generate upload URL.' });
  }
});

// ---------------------------------------------------------------------------
// Mock hardware attestation
// In production: verify a signed attestation token from the device
// (e.g., Android Key Attestation, iOS DeviceCheck, or a custom HSM signature).
// ---------------------------------------------------------------------------
function mockHardwareAttestation(): { success: true } | { success: false; reason: string } {
  return { success: true };
}

export default router;
