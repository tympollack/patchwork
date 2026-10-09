import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import {
  DEFAULT_SALT,
  DEFAULT_SECRET,
  generateAuthToken,
  generateParcelStandingToken,
  getPinSalt,
  getAuthSecret,
} from '../../../../packages/engine/src/scripts/generate-mail-manifest';

export interface VerifyParcelResult {
  success: boolean;
  error?: string;
  zoningNodeId?: string;
  redirectUrl?: string;
  claimToken?: string;
}

// In-memory rate-limiter: track failed attempts per parcel PIN
const failedAttemptsMap = new Map<string, { count: number; lockedUntil: number }>();

export function resetVerificationRateLimit(parcelPin: string): void {
  failedAttemptsMap.delete(parcelPin);
}

/**
 * Server Action: verifyParcelClaim
 * Validates 6-digit PIN against buffer_parcels.claim_pin_hash,
 * guards against brute-force attacks with rate limiting,
 * blocks override of flagged parcels, and verifies QR auth tokens.
 */
export async function verifyParcelClaim(
  parcelPin: string,
  plainPin: string,
  defaultZoningNodeId: string = 'swim-club-zoning-node',
  authToken?: string,
  customSalt: string = getPinSalt()
): Promise<VerifyParcelResult> {
  if (!parcelPin || !plainPin) {
    return {
      success: false,
      error: 'Parcel PIN and 6-digit verification code are required.',
    };
  }

  // 1. Rate Limiting Guard: 5 failed attempts threshold
  const now = Date.now();
  const rateLimitState = failedAttemptsMap.get(parcelPin);
  if (rateLimitState && rateLimitState.lockedUntil > now) {
    const remainingSec = Math.ceil((rateLimitState.lockedUntil - now) / 1000);
    return {
      success: false,
      error: `Too many failed attempts. Rate limit engaged. Try again in ${remainingSec} seconds.`,
    };
  }

  // 2. Sanitize 6-digit numeric PIN
  const cleanPin = plainPin.trim();
  if (!/^\d{6}$/.test(cleanPin)) {
    return {
      success: false,
      error: 'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.',
    };
  }

  // 3. QR Token Verification (if provided or enforced)
  const isTokenEnforced =
    process.env.ENFORCE_QR_TOKEN === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.BYPASS_QR_TOKEN !== 'true');

  if (authToken) {
    const expectedToken = generateAuthToken(parcelPin, cleanPin, getAuthSecret());
    if (authToken !== expectedToken) {
      return {
        success: false,
        error: 'Invalid postcard QR authentication token. Possible forgery detected.',
      };
    }
  } else if (isTokenEnforced) {
    return {
      success: false,
      error: 'Direct-mail QR authentication token is strictly required to claim parcel standing.',
    };
  }

  // 4. Calculate cryptographic SHA-256 hash using synchronized salt
  const computedHash = crypto
    .createHash('sha256')
    .update(`${cleanPin}:${customSalt}`)
    .digest('hex');

  // 5. Supabase lookup with error guards
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

  // 6. Security Invariant: Disallow clearing flagged / disputed standing
  if (parcel.claim_status === 'flagged') {
    return {
      success: false,
      error: 'Parcel standing is currently flagged and under administrative dispute.',
    };
  }

  // 7. Validate hash match
  const expectedHash = parcel.claim_pin_hash;
  if (!expectedHash || expectedHash !== computedHash) {
    // Record failed attempt and trigger progressive lock after 5 failures
    const attempts = (rateLimitState?.count || 0) + 1;
    const isLocked = attempts >= 5;
    const lockedUntil = isLocked ? now + 60000 : 0; // 60-second lockout
    failedAttemptsMap.set(parcelPin, { count: attempts, lockedUntil });

    return {
      success: false,
      error: isLocked
        ? 'Maximum verification attempts exceeded (5/5). Rate limit engaged. Try again in 60 seconds.'
        : `Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody. (${5 - attempts} attempt${5 - attempts === 1 ? '' : 's'} remaining)`,
    };
  }

  // Clear rate-limiting records on success
  failedAttemptsMap.delete(parcelPin);

  // 8. Mutation: mark status active
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
  const claimToken = generateParcelStandingToken(parcel.parcel_pin, parcel.id, getAuthSecret());
  return {
    success: true,
    zoningNodeId: targetNodeId,
    claimToken,
    redirectUrl: `/audit/${targetNodeId}?buffer_parcel_id=${parcel.id}&parcel_pin=${encodeURIComponent(parcel.parcel_pin)}&claim_token=${claimToken}`,
  };
}

/**
 * Server Action alias matching specification: verifyPostcardPin
 */
export async function verifyPostcardPin(
  parcelPin: string,
  plainPin: string,
  authToken?: string
): Promise<VerifyParcelResult> {
  return verifyParcelClaim(parcelPin, plainPin, 'swim-club-zoning-node', authToken);
}
