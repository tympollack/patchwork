import {
  generateSecurePin,
  hashPin,
  verifyPinHash,
  generateAuthToken,
  buildQrDestinationUrl,
  generateMailManifest,
} from '../packages/engine/src/scripts/generate-mail-manifest';

describe('TASK-PW-ZON-02: Direct-Mail Parcel PIN Generation and Dispatch Pipeline', () => {
  it('generates a valid 6-digit numeric PIN', () => {
    const pin = generateSecurePin();
    expect(pin).toMatch(/^\d{6}$/);
    const num = parseInt(pin, 10);
    expect(num).toBeGreaterThanOrEqual(100000);
    expect(num).toBeLessThanOrEqual(999999);
  });

  it('hashes PIN with salt and verifies hash correctly', () => {
    const pin = '482910';
    const salt = 'test_salt_xyz';
    const hash = hashPin(pin, salt);

    expect(hash).toHaveLength(64);
    expect(verifyPinHash(pin, hash, salt)).toBe(true);
    expect(verifyPinHash('111111', hash, salt)).toBe(false);
  });

  it('constructs correct postcard QR target URL', () => {
    const parcelPin = 'HAM-04-102-09';
    const authToken = 'token_abc123';
    const url = buildQrDestinationUrl(parcelPin, authToken, 'https://patchwork.id');

    expect(url).toBe('https://patchwork.id/verify?p=HAM-04-102-09&t=token_abc123');
  });

  it('generates 123 verified lines without duplicate PINs and compliant CSV manifest', () => {
    const mock123Parcels = Array.from({ length: 123 }, (_, i) => ({
      parcel_pin: `HAM-04-102-${String(i + 1).padStart(3, '0')}`,
      deeded_address: `${100 + i} Old Orchard Ln, Cincinnati, OH 45230`,
    }));

    const { csvContent, rows } = generateMailManifest(mock123Parcels);

    expect(rows).toHaveLength(123);

    // Verify no duplicate PINs across all 123 parcels
    const uniquePins = new Set(rows.map((r) => r.plaintext_pin));
    expect(uniquePins.size).toBe(123);

    // Verify each generated row has verifiable hash
    for (const row of rows) {
      expect(verifyPinHash(row.plaintext_pin, row.claim_pin_hash)).toBe(true);
      expect(row.destination_url).toContain(`p=${encodeURIComponent(row.parcel_pin)}`);
    }

    // Verify CSV line count (header + 123 lines)
    const lines = csvContent.trim().split('\n');
    expect(lines).toHaveLength(124);
    expect(lines[0]).toBe('parcel_pin,deeded_address,plaintext_pin,claim_pin_hash,qr_destination_url');
  });
});
