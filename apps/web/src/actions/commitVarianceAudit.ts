import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';

export type BufferStatusType = 'Intact' | 'Degraded' | 'Encroached';

export interface CommitVarianceAuditInput {
  parcelPin: string;
  setbackDistanceFt: number;
  bufferStatus: BufferStatusType;
  drainageErosionIndex: number;
  observableImpact: string;
  evidenceS3Url: string;
  evidenceSha256: string;
  zoningNodeId?: string | null;
  bufferParcelId?: string | null;
  lat?: number | null;
  lng?: number | null;
  azHeading?: number | null;
  gpsPrecisionM?: number | null;
  capturedAt?: string | null;
}

export interface CommitVarianceAuditResult {
  success: boolean;
  error?: string;
  filingRef?: string;
  auditId?: string;
  sha256?: string;
}

export function generateVarianceFilingRef(): string {
  const tsPart = Date.now().toString(36).slice(-4).toUpperCase();
  const randPart = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `#VAR-${tsPart}-${randPart}`;
}

export async function commitVarianceAudit(
  input: CommitVarianceAuditInput
): Promise<CommitVarianceAuditResult> {
  const {
    parcelPin,
    setbackDistanceFt,
    bufferStatus,
    drainageErosionIndex,
    observableImpact,
    evidenceS3Url,
    evidenceSha256,
    zoningNodeId,
    bufferParcelId,
    lat,
    lng,
    azHeading,
    gpsPrecisionM,
    capturedAt,
  } = input;

  // 1. Validate Parcel PIN
  const cleanPin = (parcelPin || '').trim();
  if (!cleanPin) {
    return { success: false, error: 'Parcel PIN is required.' };
  }

  // 2. Validate numeric setback boundaries (Acceptance Criteria)
  if (
    typeof setbackDistanceFt !== 'number' ||
    !isFinite(setbackDistanceFt) ||
    isNaN(setbackDistanceFt) ||
    setbackDistanceFt <= 0
  ) {
    return {
      success: false,
      error: 'Setback distance must be a valid positive number of feet.',
    };
  }

  // 3. Validate buffer status
  const validBufferStatuses: BufferStatusType[] = ['Intact', 'Degraded', 'Encroached'];
  if (!validBufferStatuses.includes(bufferStatus)) {
    return {
      success: false,
      error: 'Buffer status must be one of: Intact, Degraded, Encroached.',
    };
  }

  // 4. Validate drainage erosion index (1-5)
  if (
    typeof drainageErosionIndex !== 'number' ||
    !Number.isInteger(drainageErosionIndex) ||
    drainageErosionIndex < 1 ||
    drainageErosionIndex > 5
  ) {
    return {
      success: false,
      error: 'Drainage erosion index must be an integer between 1 and 5.',
    };
  }

  // 5. Validate observable impact summary (max 240 chars)
  const trimmedImpact = (observableImpact || '').trim();
  if (!trimmedImpact) {
    return {
      success: false,
      error: 'Observable impact summary must not be empty.',
    };
  }

  if (trimmedImpact.length > 180) {
    return {
      success: false,
      error: 'Observable impact summary exceeds statutory limit of 180 characters.',
    };
  }

  // 6. Validate camera capture checksum (Acceptance Criteria)
  if (!evidenceS3Url || !evidenceSha256) {
    return {
      success: false,
      error: 'Verified sightline camera capture with SHA-256 checksum is required prior to submission.',
    };
  }

  if (!/^[a-fA-F0-9]{64}$/.test(evidenceSha256)) {
    return {
      success: false,
      error: 'Invalid cryptographic SHA-256 checksum format.',
    };
  }

  const filingRef = generateVarianceFilingRef();

  // Construct structured narrative summary incorporating all audit dimensions without truncation
  const prefix = `[Setback: ${setbackDistanceFt}ft | Buffer: ${bufferStatus} | Erosion: ${drainageErosionIndex}/5] `;
  const formattedSummary = `${prefix}${trimmedImpact}`;
  if (formattedSummary.length > 240) {
    return {
      success: false,
      error: `Combined narrative summary (${formattedSummary.length} chars) exceeds statutory limit of 240 characters. Please shorten observable impact statement.`,
    };
  }

  try {
    // Resolve zoning docket ID if not directly provided
    let resolvedZoningNodeId = zoningNodeId;
    let resolvedBufferParcelId = bufferParcelId;

    // 7. Standing Guard: Verify parcel standing and resolve IDs
    const { data: parcelRow, error: pErr } = await supabase
      .schema('patchwork')
      .from('buffer_parcels')
      .select('id, zoning_node_id, claim_status')
      .eq('parcel_pin', cleanPin)
      .maybeSingle();

    if (pErr) {
      return {
        success: false,
        error: `Database error querying parcel registry: ${pErr.message}`,
      };
    }

    if (!parcelRow) {
      return {
        success: false,
        error: `Referenced buffer parcel PIN ${cleanPin} could not be verified in registry.`,
      };
    }

    if (!['active', 'verified'].includes(parcelRow.claim_status)) {
      return {
        success: false,
        error: `Claimant standing is '${parcelRow.claim_status}'. Active or verified standing required prior to submitting variance affidavits.`,
      };
    }

    resolvedBufferParcelId = resolvedBufferParcelId || parcelRow.id;
    resolvedZoningNodeId = resolvedZoningNodeId || parcelRow.zoning_node_id;

    if (!resolvedZoningNodeId) {
      // Fallback: query any active zoning node or first available
      const { data: activeNode, error: nErr } = await supabase
        .schema('patchwork')
        .from('zoning_nodes')
        .select('id')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!nErr && activeNode) {
        resolvedZoningNodeId = activeNode.id;
      }
    }

    // Persist immutable affidavit to patchwork.impact_affidavits
    const { data: inserted, error: insertError } = await supabase
      .schema('patchwork')
      .from('impact_affidavits')
      .insert({
        zoning_node_id: resolvedZoningNodeId || '00000000-0000-0000-0000-000000000000',
        buffer_parcel_id: resolvedBufferParcelId || null,
        code_section: '§14-SETBACK-VARIANCE',
        narrative_summary: formattedSummary,
        evidence_s3_url: evidenceS3Url,
        evidence_sha256: evidenceSha256,
        az_heading: azHeading !== undefined && azHeading !== null && isFinite(azHeading) ? azHeading : null,
        gps_precision_m: gpsPrecisionM !== undefined && gpsPrecisionM !== null && isFinite(gpsPrecisionM) ? gpsPrecisionM : null,
        captured_lat: lat !== undefined && lat !== null && isFinite(lat) ? lat : null,
        captured_lng: lng !== undefined && lng !== null && isFinite(lng) ? lng : null,
        captured_at: capturedAt || new Date().toISOString(),
        filing_ref: filingRef,
      })
      .select('id')
      .single();

    if (insertError) {
      return {
        success: false,
        error: `Database commitment failed: ${insertError.message}`,
      };
    }

    return {
      success: true,
      filingRef,
      auditId: inserted?.id,
      sha256: evidenceSha256,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Variance audit submission failed: ${err.message || 'Unknown error'}`,
    };
  }
}
