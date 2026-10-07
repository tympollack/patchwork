import { commitAffidavit } from '../apps/web/src/actions/commitAffidavit';
import { MUNICIPAL_VIOLATION_CODES } from '../apps/web/src/components/affidavit/CodeSectionRadioGroup';
import { supabase } from '../src/lib/supabase';

const mockInsert = jest.fn();
const mockSingle = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        insert: (payload: any) => ({
          select: jest.fn().mockReturnValue({
            single: () => mockSingle(),
          }),
        }),
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

  it('successfully commits affidavit and returns filing reference and SHA-256 receipt', async () => {
    const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'affidavit-uuid-999',
        filing_ref: '#AFF-4821',
        evidence_sha256: sha,
      },
      error: null,
    });

    const res = await commitAffidavit({
      zoningNodeId: 'node-123',
      codeSection: '§14-A',
      narrativeSummary: '18-foot grading encroachment observed inside buffer line.',
      evidenceS3Url: 'https://r2.storage/pic.jpg',
      evidenceSha256: sha,
      azHeading: 142,
      gpsPrecisionM: 2.5,
    });

    expect(res.success).toBe(true);
    expect(res.filingRef).toMatch(/^#AFF-\d{4}$/);
    expect(res.sha256).toBe(sha);
    expect(res.affidavitId).toBe('affidavit-uuid-999');
  });
});
