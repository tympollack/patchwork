// Mock AWS S3 SDK before importing route to prevent untransformed ES module import in Jest
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((args) => args),
}));

// Mock S3 presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-r2.storage/upload?sig=123'),
}));

import { computeImageSha256 } from '../apps/web/src/lib/cryptoWatermark';
import { completePortUpload } from '../apps/web/src/actions/completePortUpload';
import { POST } from '../apps/web/src/app/api/ports/request-upload/route';
import { supabase } from '../src/lib/supabase';

const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation((table: string) => {
        if (table === 'nodes') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: () => mockMaybeSingle(),
              }),
            }),
            update: (payload: any) => {
              mockUpdate(payload);
              return {
                eq: jest.fn().mockResolvedValue({ error: null }),
              };
            },
          };
        }
        if (table === 'ports') {
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
        }
        return {};
      }),
    }),
  },
}));

describe('TASK-PW-S3-WATERMARK-SYNC: Direct Checksum Verification & Ledger Sync', () => {
  const sampleHexSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // sha256 of empty buffer

  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({
      data: { node_id: 'test-node-101', status: 'awaiting_verification' },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: {
        id: 'port-record-uuid',
        node_id: 'test-node-101',
        image_url: 'https://ports-stag.patchwork.id/evidence.jpg',
        image_hash: sampleHexSha256,
      },
      error: null,
    });
  });

  describe('1. Client SHA-256 Computation', () => {
    it('computes deterministic SHA-256 hash using Web Crypto API', async () => {
      const buffer = new TextEncoder().encode('PatchWork Hardware Watermark Test Payload');
      const result = await computeImageSha256(buffer);

      expect(typeof result.hex).toBe('string');
      expect(result.hex).toHaveLength(64);
      expect(result.hex).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof result.base64).toBe('string');
      expect(result.base64.length).toBeGreaterThan(0);
    });
  });

  describe('2. Presigned PUT URL Generator & Mandated Checksum Header', () => {
    it('rejects request with missing or malformed SHA-256', async () => {
      const req = new Request('https://test/api/ports/request-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: 'test-node-101',
          sha256: 'invalid-hash',
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Valid 64-character SHA-256 hexadecimal hash required');
    });

    it('rejects request without target nodeId', async () => {
      const req = new Request('https://test/api/ports/request-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha256: sampleHexSha256,
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toContain('Target node ID is required');
    });

    it('generates presigned PUT URL and mandates x-amz-checksum-sha256 matching the hash', async () => {
      const req = new Request('https://test/api/ports/request-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeId: 'test-node-101',
          sha256: sampleHexSha256,
        }),
      });

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.uploadUrl).toBeDefined();
      expect(json.publicUrl).toContain('ports-stag.patchwork.id');
      expect(json.requiredHeaders).toBeDefined();
      expect(json.requiredHeaders['x-amz-checksum-sha256']).toBe(
        Buffer.from(sampleHexSha256, 'hex').toString('base64')
      );
    });
  });

  describe('3. Upload Completion & Node Lifecycle Expiration Timestamps', () => {
    it('persists port row and updates node expiration timestamps (yellow 7d / red 14d)', async () => {
      const result = await completePortUpload({
        nodeId: 'test-node-101',
        userId: 'test-user-uuid',
        imageUrl: 'https://ports-stag.patchwork.id/ports/prod/test-node-101/pic.jpg',
        imageHash: sampleHexSha256,
        gpsLat: 39.0501,
        gpsLng: -84.1915,
        azHeading: 270,
      });

      expect(result.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          node_id: 'test-node-101',
          user_id: 'test-user-uuid',
          image_hash: sampleHexSha256,
          gps_lat: 39.0501,
          gps_lng: -84.1915,
          az_heading: 270,
        })
      );

      // Verify node update includes expiration timestamps
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          sha256_hash: sampleHexSha256,
          expires_at_yellow: expect.any(String),
          expires_at_red: expect.any(String),
        })
      );

      expect(result.receipt).toBeDefined();
      expect(result.receipt?.imageHash).toBe(sampleHexSha256);
      expect(result.receipt?.expiresAtYellow).toBeDefined();
      expect(result.receipt?.expiresAtRed).toBeDefined();
    });

    it('rejects completion with missing required fields', async () => {
      const result = await completePortUpload({
        nodeId: '',
        imageUrl: '',
        imageHash: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameters');
    });
  });
});
