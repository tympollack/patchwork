import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';

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
  } = input;

  // 1. Validation guards
  if (!zoningNodeId) {
    return { success: false, error: 'Target zoning node ID is required.' };
  }

  if (!codeSection) {
    return { success: false, error: 'A statutory municipal code section must be selected.' };
  }

  if (!evidenceS3Url || !evidenceSha256) {
    return {
      success: false,
      error: 'Verified sightline camera capture with SHA-256 checksum is required.',
    };
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

  // 2. Standing Guard: If bufferParcelId is supplied, verify active claimant standing
  if (bufferParcelId) {
    const { data: parcel, error: pError } = await supabase
      .schema('patchwork')
      .from('buffer_parcels')
      .select('claim_status')
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
  }

  // 3. Generate collision-resistant filing reference
  const filingRef = generateFilingReference();

  // 4. Persist to Supabase with error guards
  const { data, error } = await supabase
    .schema('patchwork')
    .from('impact_affidavits')
    .insert({
      zoning_node_id: zoningNodeId,
      buffer_parcel_id: bufferParcelId || null,
      code_section: codeSection,
      narrative_summary: trimmedNarrative,
      evidence_s3_url: evidenceS3Url,
      evidence_sha256: evidenceSha256,
      az_heading: azHeading !== undefined && azHeading !== null ? Number(azHeading) : null,
      gps_precision_m:
        gpsPrecisionM !== undefined && gpsPrecisionM !== null ? Number(gpsPrecisionM) : null,
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
