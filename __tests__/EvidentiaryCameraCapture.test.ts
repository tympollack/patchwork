// Mock AWS S3 SDK before importing route to prevent untransformed ES module import in Jest
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-s3-presigned-url.com/upload'),
}));

const mockMaybeSingle = jest.fn();
const mockGetUser = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: any[]) => mockGetUser(...args),
    },
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: () => mockMaybeSingle(table),
          }),
        }),
      })),
    }),
  },
}));

import { POST } from '../apps/web/src/app/api/evidence/presign/route';
import {
  generateParcelStandingToken,
  getAuthSecret,
} from '../packages/engine/src/scripts/generate-mail-manifest';

describe('TASK-PW-ZON-05: Hardware-Attested In-App Camera Sightline Capture Component', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockGetUser.mockReset();

    mockMaybeSingle.mockImplementation((table: string) => {
      if (table === 'zoning_nodes') {
        return Promise.resolve({
          data: { id: 'swim-club-node-1', status: 'active' },
          error: null,
        });
      }
      if (table === 'buffer_parcels') {
        return Promise.resolve({
          data: {
            id: 'parcel-102-09',
            parcel_pin: 'HAM-04-102-09',
            zoning_node_id: 'swim-club-node-1',
            claim_status: 'verified',
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('rejects invalid or missing SHA-256 checksum with 400 status', async () => {
    const req = new Request('http://localhost:3000/api/evidence/presign', {
      method: 'POST',
      body: JSON.stringify({ sha256: 'not-a-valid-hash' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain('Valid SHA-256 hexadecimal hash required');
  });

  it('generates presigned PUT URL and returns required x-amz-checksum-sha256 header when claimToken is provided', async () => {
    const validHash = 'a'.repeat(64);
    const secret = getAuthSecret();
    const claimToken = generateParcelStandingToken('HAM-04-102-09', 'parcel-102-09', secret);

    const req = new Request('http://localhost:3000/api/evidence/presign', {
      method: 'POST',
      body: JSON.stringify({
        sha256: validHash,
        contentType: 'image/jpeg',
        parcelPin: 'HAM-04-102-09',
        zoningNodeId: 'swim-club-node-1',
        claimToken,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.uploadUrl).toBe('https://mock-s3-presigned-url.com/upload');
    expect(data.key).toContain('HAM-04-102-09');
    expect(data.requiredHeaders['x-amz-checksum-sha256']).toBeDefined();
    expect(data.sha256).toBe(validHash);
  });

  it('rejects unauthenticated requests targeting parcelPin without claim credentials with 401', async () => {
    const validHash = 'a'.repeat(64);
    const req = new Request('http://localhost:3000/api/evidence/presign', {
      method: 'POST',
      body: JSON.stringify({
        sha256: validHash,
        contentType: 'image/jpeg',
        parcelPin: 'HAM-04-102-09',
        zoningNodeId: 'swim-club-node-1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toContain('valid parcel standing credentials');
  });

  it('rejects unauthenticated requests supplying only zoningNodeId without parcel standing', async () => {
    const validHash = 'a'.repeat(64);
    const req = new Request('http://localhost:3000/api/evidence/presign', {
      method: 'POST',
      body: JSON.stringify({
        sha256: validHash,
        zoningNodeId: 'swim-club-node-1',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toContain('evidence uploads by docket ID require active verifier authentication');
  });
});
