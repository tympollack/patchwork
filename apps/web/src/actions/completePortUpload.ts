import { supabase } from '../../../../src/lib/supabase';

export interface CompletePortUploadInput {
  nodeId: string;
  userId?: string | null;
  imageUrl: string;
  imageHash: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  azHeading?: number | null;
}

export interface CompletePortUploadResult {
  success: boolean;
  error?: string;
  port?: any;
  receipt?: {
    nodeId: string;
    imageHash: string;
    imageUrl: string;
    expiresAtYellow: string;
    expiresAtRed: string;
    committedAt: string;
  };
}

/**
 * Server Action: completePortUpload
 * Commits attested image upload to patchwork.ports and refreshes node expiration lifecycle.
 */
export async function completePortUpload(
  input: CompletePortUploadInput
): Promise<CompletePortUploadResult> {
  const { nodeId, userId, imageUrl, imageHash, gpsLat, gpsLng, azHeading } = input;

  if (!nodeId || !imageUrl || !imageHash) {
    return {
      success: false,
      error: 'Missing required parameters: nodeId, imageUrl, and imageHash are mandatory.',
    };
  }

  if (!/^[a-fA-F0-9]{64}$/.test(imageHash)) {
    return {
      success: false,
      error: 'Invalid imageHash format: must be 64-character SHA-256 hexadecimal string.',
    };
  }

  const latNum = gpsLat == null ? null : isFinite(Number(gpsLat)) ? Number(gpsLat) : null;
  const lngNum = gpsLng == null ? null : isFinite(Number(gpsLng)) ? Number(gpsLng) : null;
  const headingNum = azHeading == null ? null : isFinite(Number(azHeading)) ? Number(azHeading) : null;

  try {
    // 1. Persist immutable record into patchwork.ports
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
      return {
        success: false,
        error: `Database error inserting port ledger record: ${portError.message}`,
      };
    }

    // 2. Compute expiration lifecycle timestamps
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
      return {
        success: false,
        error: `Failed to update target node lifecycle timestamps: ${nodeError?.message || 'Node not found or update rejected'}`,
      };
    }

    return {
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
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Port upload completion failed: ${err.message || 'Unknown error'}`,
    };
  }
}
