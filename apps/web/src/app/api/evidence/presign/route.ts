import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabase } from '../../../../../../../src/lib/supabase';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'dummy-account-id';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'dummy-access-key';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'dummy-secret-key';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'patchwork-ports-staging';
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
    const { sha256, contentType = 'image/jpeg', parcelPin, zoningNodeId } = body;

    // 1. Check SHA-256 validity
    if (!sha256 || !/^[a-fA-F0-9]{64}$/.test(sha256)) {
      return Response.json(
        { error: 'Valid SHA-256 hexadecimal hash required for cryptographic attestation.' },
        { status: 400 }
      );
    }

    // 2. Authorization guard: verify docket exists and is active
    if (!zoningNodeId && !parcelPin) {
      return Response.json(
        { error: 'Active zoning docket ID or registered parcel PIN required for evidence upload.' },
        { status: 403 }
      );
    }

    if (zoningNodeId) {
      const { data: node, error: nodeErr } = await supabase
        .schema('patchwork')
        .from('zoning_nodes')
        .select('id, status')
        .eq('id', zoningNodeId)
        .maybeSingle();

      if (nodeErr || (node && node.status !== 'active')) {
        return Response.json(
          { error: 'Unauthorized: target zoning docket is not active for evidentiary filing.' },
          { status: 403 }
        );
      }
    }

    if (parcelPin) {
      const { data: parcel, error: parcelErr } = await supabase
        .schema('patchwork')
        .from('buffer_parcels')
        .select('id, claim_status, zoning_node_id')
        .eq('parcel_pin', parcelPin)
        .maybeSingle();

      if (parcelErr || !parcel) {
        return Response.json(
          { error: 'Unauthorized: parcel PIN is not registered in the 500-ft buffer registry.' },
          { status: 403 }
        );
      }

      if (parcel.claim_status === 'flagged') {
        return Response.json(
          { error: 'Unauthorized: parcel standing is currently flagged under administrative dispute.' },
          { status: 403 }
        );
      }

      if (zoningNodeId && parcel.zoning_node_id && parcel.zoning_node_id !== zoningNodeId) {
        return Response.json(
          { error: 'Unauthorized: parcel PIN does not belong to specified zoning docket.' },
          { status: 403 }
        );
      }
    }

    const timestamp = Date.now();
    const cleanPin = parcelPin ? parcelPin.replace(/[^a-zA-Z0-9_-]/g, '_') : 'unlinked';
    const key = `evidence/${cleanPin}/${timestamp}_${sha256.slice(0, 16)}.jpg`;

    // Convert hex SHA-256 to base64 format expected by AWS S3 ChecksumSHA256 header
    const hashBase64 = Buffer.from(sha256, 'hex').toString('base64');

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ChecksumSHA256: hashBase64,
      Metadata: {
        'x-amz-meta-sha256': sha256,
        'x-amz-meta-pin': cleanPin,
        'x-amz-meta-zoning-node': zoningNodeId || 'unknown',
      },
    });

    // Generate presigned PUT URL valid for 15 minutes
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
  } catch (err: any) {
    return Response.json(
      { error: `Presigned URL generation failed: ${err.message || 'Internal error'}` },
      { status: 500 }
    );
  }
}
