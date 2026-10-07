import { supabase } from '../../../../src/lib/supabase';

export interface CommitAffidavitInput {
  zoningNodeId: string;
  bufferParcelId?: string | null;
  codeSection: string;
  narrativeSummary: string;
  evidenceS3Url: string;
  evidenceSha256: string;
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
 * Server Action: commitAffidavit
 * Validates diagnostic impact payload, computes filing reference #AFF-XXXX,
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

  // Generate formal filing reference (e.g., #AFF-0891)
  const refNum = Math.floor(1000 + Math.random() * 9000);
  const filingRef = `#AFF-${refNum}`;

  // 2. Persist to Supabase with error guards
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
