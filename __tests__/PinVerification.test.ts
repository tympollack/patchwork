import { verifyParcelClaim } from '../apps/web/src/actions/verifyParcel';
import { hashPin } from '../packages/engine/src/scripts/generate-mail-manifest';
import { supabase } from '../src/lib/supabase';

// Mock Supabase client
const mockMaybeSingle = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();

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
    expect(res.error).toBe(
      'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.'
    );
  });

  it('succeeds on matching cryptographic hash and updates status to active', async () => {
    const validPin = '789123';
    const validHash = hashPin(validPin);

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

    const res = await verifyParcelClaim('HAM-04-102-12', validPin);
    expect(res.success).toBe(true);
    expect(res.zoningNodeId).toBe('zoning-uuid-456');
    expect(res.redirectUrl).toBe('/audit/zoning-uuid-456');
  });
});
