import { commitVarianceAudit } from '../apps/web/src/actions/commitVarianceAudit';
import { supabase } from '../src/lib/supabase';

const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'buffer_parcels' || table === 'zoning_nodes') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: () => mockMaybeSingle(),
              }),
              limit: jest.fn().mockReturnValue({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
          };
        }
        return {
          insert: (payload: any) => {
            mockInsert(payload);
            return {
              select: jest.fn().mockReturnValue({
                single: () => mockSingle(),
              }),
            };
          },
        };
      }),
    }),
  },
}));

describe('TASK-PW-FIELD-AUDIT-FORM: Environmental & Setback Audit Form Schema', () => {
  const validHexSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSingle.mockResolvedValue({
      data: { id: 'test-audit-uuid' },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'test-parcel-id',
        zoning_node_id: 'test-node-id',
        claim_status: 'verified',
      },
      error: null,
    });
  });

  describe('Numeric Setback Boundary Validation', () => {
    it('rejects non-numeric or NaN setback distance', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: NaN as any,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'Minor runoff.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Setback distance must be a valid positive number of feet');
    });

    it('rejects zero or negative setback distance', async () => {
      const resZero = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 0,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'Minor runoff.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(resZero.success).toBe(false);
      expect(resZero.error).toContain('Setback distance must be a valid positive number of feet');

      const resNegative = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: -15.5,
        bufferStatus: 'Degraded',
        drainageErosionIndex: 2,
        observableImpact: 'Slope damage.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(resNegative.success).toBe(false);
      expect(resNegative.error).toContain('Setback distance must be a valid positive number of feet');
    });

    it('accepts valid positive floating point setback distances', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 42.5,
        bufferStatus: 'Intact',
        drainageErosionIndex: 2,
        observableImpact: 'Normal grading buffer intact.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(true);
      expect(res.filingRef).toMatch(/^#VAR-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });

  describe('Camera Capture Checksum Enforcement', () => {
    it('blocks submission if camera capture checksum is missing', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 30,
        bufferStatus: 'Degraded',
        drainageErosionIndex: 3,
        observableImpact: 'Observed erosion channel along slope.',
        evidenceS3Url: '',
        evidenceSha256: '',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Verified sightline camera capture with SHA-256 checksum is required');
    });

    it('rejects invalid or corrupted SHA-256 hash formatting', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 30,
        bufferStatus: 'Degraded',
        drainageErosionIndex: 3,
        observableImpact: 'Observed erosion channel along slope.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: 'not-a-valid-sha256-hex',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid cryptographic SHA-256 checksum format');
    });
  });

  describe('Claimant Standing & Buffer Registry Guards', () => {
    it('rejects submission if parcel is not found in registry', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const res = await commitVarianceAudit({
        parcelPin: 'PIN-UNKNOWN-00',
        setbackDistanceFt: 25,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('could not be verified in registry');
    });

    it('rejects submission if claimant standing is not active or verified', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'test-parcel-id',
          claim_status: 'flagged',
        },
        error: null,
      });

      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 25,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Claimant standing is 'flagged'");
    });
  });

  describe('Form Field Boundary & Status Validation', () => {
    it('rejects empty parcel PIN', async () => {
      const res = await commitVarianceAudit({
        parcelPin: '   ',
        setbackDistanceFt: 25,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe('Parcel PIN is required.');
    });

    it('rejects invalid buffer status not in enum', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 25,
        bufferStatus: 'InvalidStatus' as any,
        drainageErosionIndex: 1,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Buffer status must be one of: Intact, Degraded, Encroached');
    });

    it('rejects drainage erosion index outside 1 to 5', async () => {
      const resLow = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 25,
        bufferStatus: 'Intact',
        drainageErosionIndex: 0,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(resLow.success).toBe(false);
      expect(resLow.error).toContain('Drainage erosion index must be an integer between 1 and 5');

      const resHigh = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 25,
        bufferStatus: 'Intact',
        drainageErosionIndex: 6,
        observableImpact: 'No encroachment.',
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(resHigh.success).toBe(false);
      expect(resHigh.error).toContain('Drainage erosion index must be an integer between 1 and 5');
    });

    it('rejects observable impact exceeding 180 characters', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-100-20-01',
        setbackDistanceFt: 25,
        bufferStatus: 'Encroached',
        drainageErosionIndex: 4,
        observableImpact: 'X'.repeat(181),
        evidenceS3Url: 'https://r2.storage/photo.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('exceeds statutory limit of 180 characters');
    });
  });

  describe('Database Persistence & Payload Formatting', () => {
    it('persists structured narrative and sightline telemetry to impact_affidavits without truncation', async () => {
      const res = await commitVarianceAudit({
        parcelPin: 'PIN-550-84-01',
        setbackDistanceFt: 38.5,
        bufferStatus: 'Encroached',
        drainageErosionIndex: 4,
        observableImpact: 'Tree root damage and active gully erosion.',
        evidenceS3Url: 'https://r2.storage/evidence_550.jpg',
        evidenceSha256: validHexSha256,
        lat: 39.0501,
        lng: -84.1915,
        azHeading: 184,
        gpsPrecisionM: 3.2,
      });

      expect(res.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          code_section: '§14-SETBACK-VARIANCE',
          narrative_summary: '[Setback: 38.5ft | Buffer: Encroached | Erosion: 4/5] Tree root damage and active gully erosion.',
          evidence_s3_url: 'https://r2.storage/evidence_550.jpg',
          evidence_sha256: validHexSha256,
          captured_lat: 39.0501,
          captured_lng: -84.1915,
          az_heading: 184,
          gps_precision_m: 3.2,
        })
      );
    });

    it('rejects submission if buffer parcel is registered under a different zoning docket', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'test-parcel-id',
          zoning_node_id: 'docket-uuid-abc',
          claim_status: 'verified',
        },
        error: null,
      });

      const res = await commitVarianceAudit({
        parcelPin: 'PIN-550-84-01',
        zoningNodeId: 'docket-uuid-different',
        setbackDistanceFt: 35,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'Normal grading buffer intact.',
        evidenceS3Url: 'https://r2.storage/evidence_550.jpg',
        evidenceSha256: validHexSha256,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Target zoning docket mismatch');
    });

    it('rejects submission if caller provides an invalid claimant verification PIN', async () => {
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'test-parcel-id',
          zoning_node_id: 'docket-uuid-abc',
          parcel_pin: 'PIN-550-84-01',
          claim_status: 'verified',
          claim_pin_hash: 'valid-pin-hash',
        },
        error: null,
      });

      const res = await commitVarianceAudit({
        parcelPin: 'PIN-550-84-01',
        setbackDistanceFt: 35,
        bufferStatus: 'Intact',
        drainageErosionIndex: 1,
        observableImpact: 'Normal grading buffer intact.',
        evidenceS3Url: 'https://r2.storage/evidence_550.jpg',
        evidenceSha256: validHexSha256,
        claimPin: '000000',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid claimant verification PIN');
    });

    it('enforces standing proof when ENFORCE_STANDING_PROOF is enabled', async () => {
      process.env.ENFORCE_STANDING_PROOF = 'true';
      try {
        mockMaybeSingle.mockResolvedValueOnce({
          data: {
            id: 'test-parcel-id',
            zoning_node_id: 'docket-uuid-abc',
            parcel_pin: 'PIN-550-84-01',
            claim_status: 'verified',
            claim_pin_hash: 'valid-pin-hash',
          },
          error: null,
        });

        const res = await commitVarianceAudit({
          parcelPin: 'PIN-550-84-01',
          setbackDistanceFt: 35,
          bufferStatus: 'Intact',
          drainageErosionIndex: 1,
          observableImpact: 'Normal grading buffer intact.',
          evidenceS3Url: 'https://r2.storage/evidence_550.jpg',
          evidenceSha256: validHexSha256,
        });

        expect(res.success).toBe(false);
        expect(res.error).toContain('Evidentiary standing verification failed');
      } finally {
        delete process.env.ENFORCE_STANDING_PROOF;
      }
    });
  });
});
