import crypto from 'crypto';
import { supabase } from '../../../../src/lib/supabase';
import {
  generateAuthToken,
  generateParcelStandingToken,
  getAuthSecret,
  verifyPinHash,
} from '../../../../packages/engine/src/scripts/generate-mail-manifest';

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
  claimPin?: string | null;
  claimToken?: string | null;
  authToken?: string | null;
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
      .select('id, zoning_node_id, parcel_pin, claim_status, claim_pin_hash')
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

    // Comment 11 fix: Enforce that resolvedZoningNodeId is bound strictly to parcelRow.zoning_node_id.
    // If client supplied a zoningNodeId that contradicts the parcel record, reject with mismatch error.
    if (zoningNodeId && parcelRow.zoning_node_id && zoningNodeId !== parcelRow.zoning_node_id) {
      return {
        success: false,
        error: `Target zoning docket mismatch. Buffer parcel is registered under docket ${parcelRow.zoning_node_id}, not ${zoningNodeId}.`,
      };
    }

    if (bufferParcelId && bufferParcelId !== parcelRow.id) {
      return {
        success: false,
        error: 'Buffer parcel ID mismatch with registered parcel record.',
      };
    }

    resolvedBufferParcelId = parcelRow.id;
    resolvedZoningNodeId = parcelRow.zoning_node_id || zoningNodeId;

    // Comment 19 fix: Standing verification guard
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
      if (parcelRow.claim_pin_hash && verifyPinHash(cleanClaimPin, parcelRow.claim_pin_hash)) {
        hasValidStandingProof = true;
      } else {
        return {
          success: false,
          error: 'Invalid claimant verification PIN. Standing could not be established.',
        };
      }
    }

    // C. Cryptographic HMAC standing token check (Fix SEC_0001)
    if (tokenToVerify && !tokenToVerify.startsWith('Bearer ') && parcelRow.parcel_pin) {
      const secret = getAuthSecret();
      const expectedStandingToken = generateParcelStandingToken(parcelRow.parcel_pin, parcelRow.id, secret);
      const expectedAuthToken = cleanClaimPin
        ? generateAuthToken(parcelRow.parcel_pin, cleanClaimPin, secret)
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
        error: 'Evidentiary standing verification failed. Claimant PIN, postcard auth token, or active verified session required to file variance audits.',
      };
    }

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
