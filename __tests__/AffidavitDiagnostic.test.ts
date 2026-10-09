import { commitAffidavit } from '../apps/web/src/actions/commitAffidavit';
import { MUNICIPAL_VIOLATION_CODES } from '../apps/web/src/components/affidavit/CodeSectionRadioGroup';
import { supabase } from '../src/lib/supabase';

const mockInsert = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'buffer_parcels') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
          };
        }
        return {
          insert: (payload: any) => ({
            select: jest.fn().mockReturnValue({
              single: () => mockSingle(),
            }),
          }),
        };
      }),
    }),
  },
}));

describe('TASK-PW-ZON-06: Statutory Diagnostic Impact Affidavit Intake Funnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('contains four statutory municipal code sections', () => {
    const codes = MUNICIPAL_VIOLATION_CODES.map((c) => c.code);
    expect(codes).toEqual(['§14-A', '§18-C', '§09-D', '§22-B']);
  });

  it('rejects submission with empty impact narrative', async () => {
    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      codeSection: '§14-A',
      narrativeSummary: '   ',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: 'abc123hash',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Physical impact summary must not be empty.');
  });

  it('rejects narrative exceeding strict 240 character limit', async () => {
    const longText = 'A'.repeat(241);
    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      codeSection: '§14-A',
      narrativeSummary: longText,
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: 'abc123hash',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('exceeds statutory limit of 240 characters');
  });

  it('rejects submission if photo capture or checksum is missing', async () => {
    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      codeSection: '§14-A',
      narrativeSummary: 'Observable grading encroachment.',
      evidenceS3Url: '',
      evidenceSha256: '',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Verified sightline camera capture with SHA-256 checksum is required');
  });

  it('rejects submission if referenced parcel claimant standing is not active', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { claim_status: 'unclaimed' },
      error: null,
    });

    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      bufferParcelId: 'parcel-unclaimed-id',
      codeSection: '§14-A',
      narrativeSummary: 'Unverified claimant filing.',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: 'abc123hash',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Claimant standing is not active');
  });

  it('successfully commits affidavit with verified standing and returns collision-resistant reference and SHA-256 receipt', async () => {
    const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    mockMaybeSingle.mockResolvedValueOnce({
      data: { claim_status: 'verified' },
      error: null,
    });

    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'affidavit-uuid-999',
        filing_ref: '#AFF-7K3A-9F2B',
        evidence_sha256: sha,
      },
      error: null,
    });

    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      bufferParcelId: 'parcel-verified-id',
      codeSection: '§14-A',
      narrativeSummary: '18-foot grading encroachment observed inside buffer line.',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: sha,
      azHeading: 142,
      gpsPrecisionM: 2.5,
    });

    expect(res.success).toBe(true);
    expect(res.filingRef).toMatch(/^#AFF-[A-Z0-9]+-[A-Z0-9]+$/);
    expect(res.sha256).toBe(sha);
    expect(res.affidavitId).toBe('affidavit-uuid-999');
  });

  it('rejects submission if buffer parcel is registered under a different zoning docket', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'parcel-verified-id',
        zoning_node_id: 'different-node-999',
        claim_status: 'verified',
      },
      error: null,
    });

    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      bufferParcelId: 'parcel-verified-id',
      codeSection: '§14-A',
      narrativeSummary: 'Encroachment observed.',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('Target zoning docket mismatch');
  });

  it('rejects submission if caller provides an invalid claimant verification PIN', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'parcel-verified-id',
        zoning_node_id: 'node-123',
        claim_status: 'verified',
        claim_pin_hash: 'valid-hash',
      },
      error: null,
    });

    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      bufferParcelId: 'parcel-verified-id',
      codeSection: '§14-A',
      narrativeSummary: 'Encroachment observed.',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
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
          id: 'parcel-verified-id',
          zoning_node_id: 'node-123',
          claim_status: 'verified',
          claim_pin_hash: 'valid-hash',
        },
        error: null,
      });

      const res = await commitAffidavit({
        zoningNodeId: 'node-123',
        bufferParcelId: 'parcel-verified-id',
        codeSection: '§14-A',
        narrativeSummary: 'Encroachment observed.',
        evidenceS3Url: 'https://r2.storage/pic.jpg',
        evidenceSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Evidentiary standing verification failed');
    } finally {
      delete process.env.ENFORCE_STANDING_PROOF;
    }
  });
});
