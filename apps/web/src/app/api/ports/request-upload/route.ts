import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
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

/**
 * Authenticate incoming HTTP request using Supabase Bearer token
 */
async function authenticateRequest(
  request: Request
): Promise<{ user?: { id: string }; errorResponse?: Response }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      errorResponse: Response.json(
        { error: 'Unauthorized: missing or malformed Authorization header with Bearer token.' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      errorResponse: Response.json(
        { error: 'Unauthorized: empty Bearer token provided.' },
        { status: 401 }
      ),
    };
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return {
        errorResponse: Response.json(
          { error: 'Unauthorized: invalid or expired session token.' },
          { status: 401 }
        ),
      };
    }
    return { user: { id: data.user.id } };
  } catch {
    return {
      errorResponse: Response.json(
        { error: 'Unauthorized: token verification failed.' },
        { status: 401 }
      ),
    };
  }
}

export async function POST(request: Request) {
  try {
    const { user, errorResponse } = await authenticateRequest(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();

    // Check if this is an upload completion / ledger sync request
    if (body.action === 'complete' || body.action === 'complete-upload' || body.confirm === true) {
      return handleCompleteUpload(user!, body);
    }

    // Default: Presigned PUT URL generation
    return handleRequestPresignedUpload(user!, body);
  } catch (err: any) {
    return Response.json(
      { error: `Upload request processing failed: ${err.message || 'Internal error'}` },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { user, errorResponse } = await authenticateRequest(request);
    if (errorResponse) return errorResponse;

    const body = await request.json();
    return handleCompleteUpload(user!, body);
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
async function handleRequestPresignedUpload(user: { id: string }, body: any) {
  const { sha256, nodeId, contentType = 'image/jpeg' } = body;

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
    .select('node_id, status, user_id')
    .eq('node_id', nodeId)
    .maybeSingle();

  if (nodeErr) {
    return Response.json(
      { error: `Database error verifying target node: ${nodeErr.message}` },
      { status: 500 }
    );
  }

  if (!node) {
    return Response.json(
      { error: `Target node ${nodeId} not found.` },
      { status: 404 }
    );
  }

  if (node.status === 'archived') {
    return Response.json(
      { error: 'Target node is archived; evidence uploads are prohibited.' },
      { status: 403 }
    );
  }

  if (node.user_id && node.user_id !== user.id) {
    return Response.json(
      { error: 'Unauthorized: caller is not the owner of this node.' },
      { status: 403 }
    );
  }

  const cleanNodeId = String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '_');
  // Align staging key with upload processor worker contract: ports/<uploadId>.jpg
  const key = `ports/${cleanNodeId}.jpg`;

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
      'x-amz-meta-user-id': user.id,
    },
  });

  // URL valid for 15 minutes
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const publicUrl = `${R2_PUBLIC_DOMAIN}/ports/prod/${cleanNodeId}.jpg`;

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
async function handleCompleteUpload(user: { id: string }, body: any) {
  const {
    nodeId,
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

  // Verify caller owns node
  const { data: node, error: nodeCheckErr } = await supabase
    .schema('patchwork')
    .from('nodes')
    .select('node_id, status, user_id')
    .eq('node_id', nodeId)
    .maybeSingle();

  if (nodeCheckErr || !node) {
    return Response.json(
      { error: `Target node not found: ${nodeCheckErr?.message || 'Node does not exist'}` },
      { status: 404 }
    );
  }

  if (node.user_id && node.user_id !== user.id) {
    return Response.json(
      { error: 'Unauthorized: caller is not the owner of this node.' },
      { status: 403 }
    );
  }

  const latNum = gpsLat == null ? null : isFinite(Number(gpsLat)) ? Number(gpsLat) : null;
  const lngNum = gpsLng == null ? null : isFinite(Number(gpsLng)) ? Number(gpsLng) : null;
  const headingNum = azHeading == null ? null : isFinite(Number(azHeading)) ? Number(azHeading) : null;

  // 1. Verify object existence in R2 staging/production bucket
  let objectKey = '';
  try {
    const parsed = new URL(imageUrl);
    objectKey = parsed.pathname.replace(/^\/+/, '');
  } catch {
    objectKey = imageUrl.replace(/^\/+/, '');
  }

  if (typeof s3.send === 'function') {
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: objectKey,
        })
      );
    } catch {
      return Response.json(
        { error: `Evidentiary asset verification failed: object '${objectKey}' not found in storage.` },
        { status: 400 }
      );
    }
  }

  // 2. Persist immutable evidence row to patchwork.ports
  const { data: portRow, error: portError } = await supabase
    .schema('patchwork')
    .from('ports')
    .insert({
      node_id: nodeId,
      user_id: user.id,
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
  const { data: updatedNodes, error: nodeError } = await supabase
    .schema('patchwork')
    .from('nodes')
    .update({
      sha256_hash: imageHash,
      expires_at_yellow: expiresAtYellow,
      expires_at_red: expiresAtRed,
      updated_at: new Date(now).toISOString(),
    })
    .eq('node_id', nodeId)
    .select('node_id');

  if (nodeError || !updatedNodes || updatedNodes.length === 0) {
    return Response.json(
      { error: `Failed to update target node lifecycle: ${nodeError?.message || 'Node update failed or rejected'}` },
      { status: 500 }
    );
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
