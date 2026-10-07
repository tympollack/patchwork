import {
  generateMunicipalZoningBriefPdf,
  renderMunicipalZoningBriefHtml,
  MunicipalBriefData,
} from '../packages/reporting/templates/MunicipalZoningBrief';
import { GET } from '../apps/web/src/app/api/audit/[node_id]/export/route';
import { supabase } from '../src/lib/supabase';
import { HTN_TRUST_STRING } from '../apps/web/src/styles/tokens';

const mockMaybeSingle = jest.fn();
const mockEqParcels = jest.fn();
const mockEqAffidavits = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'zoning_nodes') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
          };
        }
        if (table === 'buffer_parcels') {
          return {
            select: jest.fn().mockReturnValue({
              eq: () => mockEqParcels(),
            }),
          };
        }
        if (table === 'impact_affidavits') {
          return {
            select: jest.fn().mockReturnValue({
              eq: () => mockEqAffidavits(),
            }),
          };
        }
        return {};
      }),
    }),
  },
}));

describe('TASK-PW-ZON-07: Municipal Dossier Aggregation and Certified PDF Export Engine', () => {
  const sampleData: MunicipalBriefData = {
    zoningNode: {
      id: 'swim-club-node-1',
      parcel_pin: 'HAM-04-102-00',
      jurisdiction: 'Hamilton County Board of Zoning Appeals',
      status: 'active',
      created_at: '2026-09-24T00:00:00Z',
    },
    parcels: Array.from({ length: 123 }, (_, i) => ({
      parcel_pin: `HAM-04-102-${String(i + 1).padStart(3, '0')}`,
      deeded_address: `${100 + i} Old Orchard Ln`,
      calculated_distance_ft: 150 + i * 2,
      claim_status: i < 87 ? 'verified' : 'unclaimed',
    })),
    affidavits: [
      {
        filing_ref: '#AFF-0891',
        code_section: '§14-A',
        narrative_summary: 'Grading encroachment across statutory 500-ft buffer line.',
        evidence_s3_url: 'https://r2.storage/evidence/photo1.jpg',
        evidence_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        az_heading: 135,
        gps_precision_m: 1.8,
        created_at: '2026-10-01T14:22:00Z',
      },
    ],
    metrics: {
      totalParcels: 123,
      claimedParcels: 87,
      verifiedParcels: 87,
      claimPercentage: 70.7,
    },
  };

  it('compiles a valid PDF-1.4 binary matching municipal standards', () => {
    const pdfBytes = generateMunicipalZoningBriefPdf(sampleData);
    const pdfString = Buffer.from(pdfBytes).toString('utf-8');

    // Standard PDF-1.4 header and trailer
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);

    // Header carries HTN institutional trust compliance stamp
    expect(pdfString).toContain('HTN');
    expect(pdfString).toContain('HAMILTON COUNTY BOARD OF ZONING APPEALS');

    // Section 1 Standing & Metrics
    expect(pdfString).toContain('87 of 123 Parcels Claimed');

    // Section 2 Geospatial buffer ledger
    expect(pdfString).toContain('SECTION 2: GEOSPATIAL BUFFER LEDGER');

    // Section 3 Exhibits
    expect(pdfString).toContain('SECTION 3: EVIDENTIARY IMPACT EXHIBITS');
    expect(pdfString).toContain('#AFF-0891');

    // Section 4 Chain of custody
    expect(pdfString).toContain('SECTION 4: CRYPTOGRAPHIC CHAIN OF CUSTODY');
    expect(pdfString).toContain('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('renders complete legal brief HTML with formal sections', () => {
    const html = renderMunicipalZoningBriefHtml(sampleData);

    expect(html).toContain(HTN_TRUST_STRING);
    expect(html).toContain('Hamilton County Board of Zoning Appeals');
    expect(html).toContain('87 of 123 Parcels Claimed — 70.7%');
    expect(html).toContain('Section 2: Geospatial Buffer Ledger');
    expect(html).toContain('Section 3: Evidentiary Impact Exhibits');
    expect(html).toContain('Section 4: Cryptographic Chain of Custody');
  });

  it('GET export route returns application/pdf with Content-Disposition attachment header', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: sampleData.zoningNode,
      error: null,
    });
    mockEqParcels.mockResolvedValueOnce({
      data: sampleData.parcels,
      error: null,
    });
    mockEqAffidavits.mockResolvedValueOnce({
      data: sampleData.affidavits,
      error: null,
    });

    const req = new Request('http://localhost:3000/api/audit/swim-club-node-1/export');
    const res = await GET(req, { params: Promise.resolve({ node_id: 'swim-club-node-1' }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename=Zoning-Dossier-HAM-04-102-00.pdf'
    );

    const bodyBuffer = await res.arrayBuffer();
    const bodyStr = Buffer.from(bodyBuffer).toString('utf-8');
    expect(bodyStr.startsWith('%PDF-1.4')).toBe(true);
  });
});
