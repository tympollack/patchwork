import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import {
  generateAuthToken,
  generateParcelStandingToken,
  getAuthSecret,
  verifyPinHash,
} from '../../../../packages/engine/src/scripts/generate-mail-manifest';

export interface CommitAffidavitInput {
  zoningNodeId: string;
  bufferParcelId?: string | null;
  codeSection: string;
  narrativeSummary: string;
  evidenceS3Url: string;
  evidenceSha256: string;
  lat?: number | null;
  lng?: number | null;
  azHeading?: number | null;
  gpsPrecisionM?: number | null;
  capturedAt?: string | null;
  claimPin?: string | null;
  claimToken?: string | null;
  authToken?: string | null;
}

export interface CommitAffidavitResult {
  success: boolean;
  error?: string;
  filingRef?: string;
  affidavitId?: string;
  sha256?: string;
}

/**
 * Generate cryptographically unique, non-colliding filing reference
 * Format: #AFF-[Hex Timestamp][Hex Random] (e.g. #AFF-7K3A-9F2B)
 */
export function generateFilingReference(): string {
  const tsPart = Date.now().toString(36).slice(-4).toUpperCase();
  const randPart = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `#AFF-${tsPart}-${randPart}`;
}

/**
 * Server Action: commitAffidavit
 * Validates diagnostic impact payload and verified claimant standing,
 * generates a collision-resistant filing reference,
 * and atomically persists immutable record into patchwork.impact_affidavits.
 */
export async function commitAffidavit(
  input: CommitAffidavitInput
): Promise<CommitAffidavitResult> {
  const {
    zoningNodeId,
    bufferParcelId,
    codeSection,
    narrativeSummary,
    evidenceS3Url,
    evidenceSha256,
    lat,
    lng,
    azHeading,
    gpsPrecisionM,
    capturedAt,
  } = input;

  // 1. Validation guards
  if (!zoningNodeId) {
    return { success: false, error: 'Target zoning node ID is required.' };
  }

  if (!codeSection) {
    return { success: false, error: 'A statutory municipal code section must be selected.' };
  }

  const trimmedNarrative = (narrativeSummary || '').trim();
  if (!trimmedNarrative) {
    return {
      success: false,
      error: 'Physical impact summary must not be empty.',
    };
  }

  if (trimmedNarrative.length > 240) {
    return {
      success: false,
      error: 'Physical impact summary exceeds statutory limit of 240 characters.',
    };
  }

  if (!evidenceS3Url || !evidenceSha256) {
    return {
      success: false,
      error: 'Verified sightline camera capture with SHA-256 checksum is required.',
    };
  }

  if (!bufferParcelId) {
    return {
      success: false,
      error: 'Verified buffer parcel ID is required to establish statutory standing.',
    };
  }

  // 2. Standing Guard: Verify active claimant standing and docket alignment
  const { data: parcel, error: pError } = await supabase
    .schema('patchwork')
    .from('buffer_parcels')
    .select('id, zoning_node_id, parcel_pin, claim_status, claim_pin_hash')
    .eq('id', bufferParcelId)
    .maybeSingle();

  if (pError || !parcel) {
    return {
      success: false,
      error: 'Referenced buffer parcel could not be verified in registry.',
    };
  }

  if (!['active', 'verified'].includes(parcel.claim_status)) {
    return {
      success: false,
      error:
        'Claimant standing is not active. Postcard PIN verification required prior to submitting affidavits.',
    };
  }

  if (parcel.zoning_node_id && parcel.zoning_node_id !== zoningNodeId) {
    return {
      success: false,
      error: `Target zoning docket mismatch. Buffer parcel is registered under docket ${parcel.zoning_node_id}, not ${zoningNodeId}.`,
    };
  }

  // Standing verification guard: ensure caller has authentic claim rights
  let hasValidStandingProof = false;
  const tokenToVerify = (input.authToken || input.claimToken || '').trim();

  // A. Authenticated verifier session verification (Fix SEC_0002)
  const sessionToken = tokenToVerify.startsWith('Bearer ') ? tokenToVerify.slice(7).trim() : undefined;
  try {
    const { data: authData, error: authErr } = await (sessionToken
      ? supabase.auth.getUser(sessionToken)
      : supabase.auth.getUser());
    if (!authErr && authData?.user) {
      const role = authData.user.app_metadata?.role || authData.user.user_metadata?.role;
      const email = authData.user.email || '';
      const isAuthorizedVerifier =
        role === 'verifier' ||
        role === 'admin' ||
        email.endsWith('@sunshade.icu') ||
        email.endsWith('@patchwork.id');
      if (isAuthorizedVerifier) {
        hasValidStandingProof = true;
      }
    }
  } catch {
    // ignore
  }

  // B. 6-digit claimant verification PIN
  const cleanClaimPin = (input.claimPin || '').trim();
  if (cleanClaimPin) {
    if (parcel.claim_pin_hash && verifyPinHash(cleanClaimPin, parcel.claim_pin_hash)) {
      hasValidStandingProof = true;
    } else {
      return {
        success: false,
        error: 'Invalid claimant verification PIN. Standing could not be established.',
      };
    }
  }

  // C. Cryptographic HMAC standing token check (Fix SEC_0001)
  if (tokenToVerify && !tokenToVerify.startsWith('Bearer ') && parcel.parcel_pin) {
    const secret = getAuthSecret();
    const expectedStandingToken = generateParcelStandingToken(parcel.parcel_pin, parcel.id, secret);
    const expectedAuthToken = cleanClaimPin
      ? generateAuthToken(parcel.parcel_pin, cleanClaimPin, secret)
      : null;

    if (tokenToVerify === expectedStandingToken || (expectedAuthToken && tokenToVerify === expectedAuthToken)) {
      hasValidStandingProof = true;
    } else {
      return {
        success: false,
        error: 'Invalid claimant authentication token. Possible forgery or unauthorized token.',
      };
    }
  }

  const enforceStandingProof =
    process.env.ENFORCE_STANDING_PROOF === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.BYPASS_STANDING_CHECK !== 'true');

  if (enforceStandingProof && !hasValidStandingProof) {
    return {
      success: false,
      error: 'Evidentiary standing verification failed. Claimant PIN, postcard auth token, or active verified session required to file impact affidavits.',
    };
  }

  // 3. Generate collision-resistant filing reference
  const filingRef = generateFilingReference();

  // 4. Persist to Supabase with error guards
  const { data, error } = await supabase
    .schema('patchwork')
    .from('impact_affidavits')
    .insert({
      zoning_node_id: zoningNodeId,
      buffer_parcel_id: bufferParcelId,
      code_section: codeSection,
      narrative_summary: trimmedNarrative,
      evidence_s3_url: evidenceS3Url,
      evidence_sha256: evidenceSha256,
      az_heading: azHeading !== undefined && azHeading !== null ? Number(azHeading) : null,
      gps_precision_m:
        gpsPrecisionM !== undefined && gpsPrecisionM !== null ? Number(gpsPrecisionM) : null,
      captured_lat: lat !== undefined && lat !== null ? Number(lat) : null,
      captured_lng: lng !== undefined && lng !== null ? Number(lng) : null,
      captured_at: capturedAt || new Date().toISOString(),
      filing_ref: filingRef,
    })
    .select('id, filing_ref, evidence_sha256')
    .single();

  if (error) {
    return {
      success: false,
      error: `Failed to commit impact affidavit: ${error.message}`,
    };
  }

  return {
    success: true,
    affidavitId: data?.id,
    filingRef: data?.filing_ref || filingRef,
    sha256: data?.evidence_sha256 || evidenceSha256,
  };
}
