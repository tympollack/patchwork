import { supabase } from './supabase';

export interface BillboardSetbacksResult {
  inside_school_buffer: boolean;
  nearest_school_dist_m: number | null;
  parcel_id: string | null;
  parcel_owner: string | null;
  deed_address?: string | null;
  error?: string;
}

/**
 * Invokes PostgreSQL PostGIS RPC `patchwork.check_billboard_setbacks`
 * Calculates distance to municipal schools and playgrounds (default 305m / ~1,000ft setback)
 * and extracts county parcel metadata.
 */
export async function checkBillboardSetbacks(
  nodeId: string,
  bufferMeters: number = 305
): Promise<BillboardSetbacksResult> {
  if (!nodeId) {
    throw new Error('nodeId is required to check billboard setbacks');
  }

  const { data, error } = await supabase.schema('patchwork').rpc('check_billboard_setbacks', {
    p_node_id: nodeId,
    p_buffer_meters: bufferMeters,
  });

  if (error) {
    throw new Error(`Failed to check billboard setbacks: ${error.message}`);
  }

  return data as BillboardSetbacksResult;
}
