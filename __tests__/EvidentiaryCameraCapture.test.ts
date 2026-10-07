// Mock AWS S3 SDK before importing route to prevent untransformed ES module import in Jest
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-s3-presigned-url.com/upload'),
}));

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { id: 'swim-club-node-1', status: 'active' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

import { POST } from '../apps/web/src/app/api/evidence/presign/route';

describe('TASK-PW-ZON-05: Hardware-Attested In-App Camera Sightline Capture Component', () => {
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

  it('generates presigned PUT URL and returns required x-amz-checksum-sha256 header', async () => {
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
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.uploadUrl).toBe('https://mock-s3-presigned-url.com/upload');
    expect(data.key).toContain('HAM-04-102-09');
    expect(data.requiredHeaders['x-amz-checksum-sha256']).toBeDefined();
    expect(data.sha256).toBe(validHash);
  });
});
