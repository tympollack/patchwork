import {
  verifyParcelClaim,
  resetVerificationRateLimit,
} from '../apps/web/src/actions/verifyParcel';
import {
  hashPin,
  generateAuthToken,
  DEFAULT_SECRET,
} from '../packages/engine/src/scripts/generate-mail-manifest';
import { supabase } from '../src/lib/supabase';

// Mock Supabase client
const mockMaybeSingle = jest.fn();
const mockUpdate = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: () => mockMaybeSingle(),
          }),
        }),
        update: (payload: any) => ({
          eq: (field: string, val: any) => mockUpdate(payload, field, val),
        }),
      }),
    }),
  },
}));

describe('TASK-PW-ZON-04: Zero-Install Parcel Credential Gate and 6-Box OTP Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetVerificationRateLimit('HAM-04-102-01');
    resetVerificationRateLimit('HAM-04-102-12');
    resetVerificationRateLimit('HAM-04-102-FLAGGED');
  });

  it('rejects invalid PIN format or length', async () => {
    const res = await verifyParcelClaim('HAM-04-102-01', '12345');
    expect(res.success).toBe(false);
    expect(res.error).toBe(
      'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.'
    );
  });

  it('rejects mismatched cryptographic hash with statutory security error', async () => {
    const correctPin = '654321';
    const correctHash = hashPin(correctPin);

    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'parcel-uuid-1',
        zoning_node_id: 'zoning-uuid-1',
        parcel_pin: 'HAM-04-102-01',
        claim_pin_hash: correctHash,
        claim_status: 'unclaimed',
      },
      error: null,
    });

    const res = await verifyParcelClaim('HAM-04-102-01', '999999');
    expect(res.success).toBe(false);
    expect(res.error).toContain(
      'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.'
    );
  });

  it('blocks claiming flagged parcel standing to prevent overriding disputes', async () => {
    const pin = '112233';
    const pinHash = hashPin(pin);

    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'parcel-uuid-flagged',
        zoning_node_id: 'zoning-uuid-1',
        parcel_pin: 'HAM-04-102-FLAGGED',
        claim_pin_hash: pinHash,
        claim_status: 'flagged',
      },
      error: null,
    });

    const res = await verifyParcelClaim('HAM-04-102-FLAGGED', pin);
    expect(res.success).toBe(false);
    expect(res.error).toContain('flagged and under administrative dispute');
  });

  it('verifies QR authToken when provided and rejects forged tokens', async () => {
    const validPin = '789123';
    const validHash = hashPin(validPin);
    const validToken = generateAuthToken('HAM-04-102-12', validPin, DEFAULT_SECRET);

    // 1. Forged token rejected
    const forgedRes = await verifyParcelClaim(
      'HAM-04-102-12',
      validPin,
      'swim-club-node',
      'forged-token-xyz'
    );
    expect(forgedRes.success).toBe(false);
    expect(forgedRes.error).toContain('Invalid postcard QR authentication token');

    // 2. Valid token accepted
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'parcel-uuid-123',
        zoning_node_id: 'zoning-uuid-456',
        parcel_pin: 'HAM-04-102-12',
        claim_pin_hash: validHash,
        claim_status: 'unclaimed',
      },
      error: null,
    });
    mockUpdate.mockResolvedValueOnce({ error: null });

    const validRes = await verifyParcelClaim(
      'HAM-04-102-12',
      validPin,
      'swim-club-node',
      validToken
    );
    expect(validRes.success).toBe(true);
  });

  it('engages rate limiting lockout after 5 consecutive failed attempts', async () => {
    const pin = '123456';
    for (let i = 0; i < 5; i++) {
      mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'parcel-uuid-1',
          zoning_node_id: 'zoning-uuid-1',
          parcel_pin: 'HAM-04-102-01',
          claim_pin_hash: 'different-hash',
          claim_status: 'unclaimed',
        },
        error: null,
      });
      await verifyParcelClaim('HAM-04-102-01', pin);
    }

    // 6th attempt engages rate limit lockout
    const lockedRes = await verifyParcelClaim('HAM-04-102-01', pin);
    expect(lockedRes.success).toBe(false);
    expect(lockedRes.error).toContain('Rate limit engaged');
  });

  it('enforces QR authToken when ENFORCE_QR_TOKEN is enabled or in production', async () => {
    process.env.ENFORCE_QR_TOKEN = 'true';
    try {
      const res = await verifyParcelClaim('HAM-04-102-01', '123456');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Direct-mail QR authentication token is strictly required');
    } finally {
      delete process.env.ENFORCE_QR_TOKEN;
    }
  });
});
