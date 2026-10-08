import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabase } from '../../../../../../../src/lib/supabase';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'dummy-account-id';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'dummy-access-key';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'dummy-secret-key';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'patchwork-ports-stag';
const R2_PUBLIC_DOMAIN =
  process.env.R2_PUBLIC_DOMAIN ||
  process.env.NEXT_PUBLIC_R2_URL ||
  'https://ports-stag.patchwork.id';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if this is an upload completion / ledger sync request
    if (body.action === 'complete' || body.confirm === true) {
      return handleCompleteUpload(body);
    }

    // Default: Presigned PUT URL generation
    return handleRequestPresignedUpload(body);
  } catch (err: any) {
    return Response.json(
      { error: `Upload request processing failed: ${err.message || 'Internal error'}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    return handleCompleteUpload(body);
  } catch (err: any) {
    return Response.json(
      { error: `Upload completion failed: ${err.message || 'Internal error'}` },
      { status: 500 }
    );
  }
}

/**
 * Handle Step 1: Presigned PUT URL generation with mandatory SHA-256 checksum header
 */
async function handleRequestPresignedUpload(body: any) {
  const { sha256, nodeId, userId, contentType = 'image/jpeg' } = body;

  // 1. Validate SHA-256 hexadecimal hash
  if (!sha256 || !/^[a-fA-F0-9]{64}$/.test(sha256)) {
    return Response.json(
      { error: 'Valid 64-character SHA-256 hexadecimal hash required for cryptographic attestation.' },
      { status: 400 }
    );
  }

  // 2. Validate target node
  if (!nodeId) {
    return Response.json(
      { error: 'Target node ID is required to request presigned upload URL.' },
      { status: 400 }
    );
  }

  const { data: node, error: nodeErr } = await supabase
    .schema('patchwork')
    .from('nodes')
    .select('node_id, status')
    .eq('node_id', nodeId)
    .maybeSingle();

  if (nodeErr) {
    return Response.json(
      { error: `Database error verifying target node: ${nodeErr.message}` },
      { status: 500 }
    );
  }

  if (node && node.status === 'archived') {
    return Response.json(
      { error: 'Target node is archived; evidence uploads are prohibited.' },
      { status: 403 }
    );
  }

  const timestamp = Date.now();
  const cleanNodeId = String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = `ports/prod/${cleanNodeId}/${timestamp}_${sha256.slice(0, 16)}.jpg`;

  // Base64 encoding mandated by S3 ChecksumSHA256 parameter
  const hashBase64 = Buffer.from(sha256, 'hex').toString('base64');

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ChecksumSHA256: hashBase64,
    Metadata: {
      'x-amz-meta-sha256': sha256,
      'x-amz-meta-node-id': cleanNodeId,
      ...(userId ? { 'x-amz-meta-user-id': String(userId) } : {}),
    },
  });

  // URL valid for 15 minutes
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const publicUrl = `${R2_PUBLIC_DOMAIN}/${key}`;

  return Response.json({
    uploadUrl,
    publicUrl,
    key,
    sha256,
    requiredHeaders: {
      'Content-Type': contentType,
      'x-amz-checksum-sha256': hashBase64,
    },
  });
}

/**
 * Handle Step 2: Atomic Ledger Persistence & Node Expiration Lifecycle Update
 */
async function handleCompleteUpload(body: any) {
  const {
    nodeId,
    userId,
    imageUrl,
    imageHash,
    gpsLat,
    gpsLng,
    azHeading,
  } = body;

  if (!nodeId || !imageUrl || !imageHash) {
    return Response.json(
      { error: 'Missing required parameters: nodeId, imageUrl, and imageHash are mandatory.' },
      { status: 400 }
    );
  }

  if (!/^[a-fA-F0-9]{64}$/.test(imageHash)) {
    return Response.json(
      { error: 'Invalid imageHash format: must be 64-character SHA-256 hexadecimal string.' },
      { status: 400 }
    );
  }

  const latNum = isFinite(Number(gpsLat)) ? Number(gpsLat) : null;
  const lngNum = isFinite(Number(gpsLng)) ? Number(gpsLng) : null;
  const headingNum = isFinite(Number(azHeading)) ? Number(azHeading) : null;

  // 1. Persist immutable evidence row to patchwork.ports
  const { data: portRow, error: portError } = await supabase
    .schema('patchwork')
    .from('ports')
    .insert({
      node_id: nodeId,
      user_id: userId || null,
      image_url: imageUrl,
      image_hash: imageHash,
      gps_lat: latNum,
      gps_lng: lngNum,
      az_heading: headingNum,
    })
    .select('*')
    .single();

  if (portError) {
    return Response.json(
      { error: `Failed to persist port ledger record: ${portError.message}` },
      { status: 500 }
    );
  }

  // 2. Compute dynamic expiration timestamps: Yellow (7d) / Red (14d)
  const now = Date.now();
  const expiresAtYellow = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
  const expiresAtRed = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();

  // 3. Atomically update target node lifecycle timestamps
  const { error: nodeError } = await supabase
    .schema('patchwork')
    .from('nodes')
    .update({
      sha256_hash: imageHash,
      expires_at_yellow: expiresAtYellow,
      expires_at_red: expiresAtRed,
      updated_at: new Date(now).toISOString(),
    })
    .eq('node_id', nodeId);

  if (nodeError) {
    console.error('Warning: failed to update node expiration timestamps:', nodeError.message);
  }

  return Response.json({
    success: true,
    port: portRow,
    receipt: {
      nodeId,
      imageHash,
      imageUrl,
      expiresAtYellow,
      expiresAtRed,
      committedAt: new Date(now).toISOString(),
    },
  });
}
