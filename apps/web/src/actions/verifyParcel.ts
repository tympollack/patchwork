import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import { DEFAULT_SALT } from '../../../../packages/engine/src/scripts/generate-mail-manifest';

export interface VerifyParcelResult {
  success: boolean;
  error?: string;
  zoningNodeId?: string;
  redirectUrl?: string;
}

/**
 * Server Action: verifyParcelClaim
 * Validates 6-digit PIN against buffer_parcels.claim_pin_hash,
 * updates claim status to 'active', and returns redirection URL.
 */
export async function verifyParcelClaim(
  parcelPin: string,
  plainPin: string,
  defaultZoningNodeId: string = 'swim-club-zoning-node'
): Promise<VerifyParcelResult> {
  if (!parcelPin || !plainPin) {
    return {
      success: false,
      error: 'Parcel PIN and 6-digit verification code are required.',
    };
  }

  // Sanitize 6-digit numeric PIN
  const cleanPin = plainPin.trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    return {
      success: false,
      error: 'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.',
    };
  }

  // Calculate cryptographic SHA-256 hash
  const computedHash = crypto
    .createHash('sha256')
    .update(`${cleanPin}:${DEFAULT_SALT}`)
    .digest('hex');

  // Supabase lookup with error guards
  const { data: parcel, error: fetchError } = await supabase
    .schema('patchwork')
    .from('buffer_parcels')
    .select('id, zoning_node_id, parcel_pin, claim_pin_hash, claim_status')
    .eq('parcel_pin', parcelPin)
    .maybeSingle();

  if (fetchError) {
    return {
      success: false,
      error: `Database lookup failure: ${fetchError.message}`,
    };
  }

  if (!parcel) {
    return {
      success: false,
      error: 'Statutory parcel record not found in 500-foot buffer ledger.',
    };
  }

  // Validate hash match
  const expectedHash = parcel.claim_pin_hash;
  if (!expectedHash || expectedHash !== computedHash) {
    return {
      success: false,
      error: 'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.',
    };
  }

  // Mutation: mark status active
  const { error: updateError } = await supabase
    .schema('patchwork')
    .from('buffer_parcels')
    .update({
      claim_status: 'active',
      claimed_at: new Date().toISOString(),
    })
    .eq('id', parcel.id);

  if (updateError) {
    return {
      success: false,
      error: `Failed to commit verified parcel standing: ${updateError.message}`,
    };
  }

  const targetNodeId = parcel.zoning_node_id || defaultZoningNodeId;
  return {
    success: true,
    zoningNodeId: targetNodeId,
    redirectUrl: `/audit/${targetNodeId}`,
  };
}

/**
 * Server Action alias matching specification: verifyPostcardPin
 */
export async function verifyPostcardPin(
  parcelPin: string,
  plainPin: string
): Promise<VerifyParcelResult> {
  return verifyParcelClaim(parcelPin, plainPin);
}
