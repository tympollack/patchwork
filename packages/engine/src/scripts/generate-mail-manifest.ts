/**
 * Direct-Mail Parcel PIN Generation and Dispatch Pipeline
 * (SPEC-PW-ZON-01 / TASK-PW-ZON-02)
 *
 * Generates cryptographically salted 6-digit PINs, unique QR claim URLs,
 * and CSV manifests formatted for direct-mail postcard fulfillment (Lob.com compatible).
 */

import crypto from 'crypto';

export interface BufferParcelInput {
  parcel_pin: string;
  deeded_address: string;
}

export interface MailManifestRow {
  parcel_pin: string;
  deeded_address: string;
  plaintext_pin: string;
  claim_pin_hash: string;
  destination_url: string;
}

export interface ManifestOptions {
  salt?: string;
  secret?: string;
  baseUrl?: string;
}

export const DEFAULT_SALT = process.env.PIN_SALT || 'patchwork_statutory_salt_v1';
export const DEFAULT_SECRET = process.env.AUTH_SECRET || 'patchwork_manifest_secret_v1';
export const DEFAULT_BASE_URL = process.env.VERIFY_BASE_URL || 'https://patchwork.id';

/**
 * Generate cryptographically random 6-digit numeric PIN (100000 - 999999)
 */
export function generateSecurePin(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Hash 6-digit PIN using SHA-256 and secret salt
 */
export function hashPin(pin: string, salt: string = DEFAULT_SALT): string {
  return crypto
    .createHash('sha256')
    .update(`${pin}:${salt}`)
    .digest('hex');
}

/**
 * Verify plaintext PIN against stored SHA-256 hash
 */
export function verifyPinHash(pin: string, expectedHash: string, salt: string = DEFAULT_SALT): boolean {
  const computed = hashPin(pin, salt);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHash));
}

/**
 * Generate HMAC auth token for postcard QR destination URL
 */
export function generateAuthToken(parcelPin: string, pin: string, secret: string = DEFAULT_SECRET): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${parcelPin}:${pin}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Construct postcard target URL: https://patchwork.id/verify?p={PARCEL_PIN}&t={AUTH_TOKEN}
 */
export function buildQrDestinationUrl(
  parcelPin: string,
  authToken: string,
  baseUrl: string = DEFAULT_BASE_URL
): string {
  const encodedPin = encodeURIComponent(parcelPin);
  const encodedToken = encodeURIComponent(authToken);
  return `${baseUrl}/verify?p=${encodedPin}&t=${encodedToken}`;
}

/**
 * Escape CSV field value
 */
function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Generate manifest rows and Lob.com / print-house formatted CSV content
 */
export function generateMailManifest(
  parcels: BufferParcelInput[],
  options: ManifestOptions = {}
): { csvContent: string; rows: MailManifestRow[] } {
  const salt = options.salt || DEFAULT_SALT;
  const secret = options.secret || DEFAULT_SECRET;
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;

  const usedPins = new Set<string>();
  const rows: MailManifestRow[] = [];

  for (const parcel of parcels) {
    let pin = generateSecurePin();
    while (usedPins.has(pin)) {
      pin = generateSecurePin();
    }
    usedPins.add(pin);

    const claim_pin_hash = hashPin(pin, salt);
    const authToken = generateAuthToken(parcel.parcel_pin, pin, secret);
    const destination_url = buildQrDestinationUrl(parcel.parcel_pin, authToken, baseUrl);

    rows.push({
      parcel_pin: parcel.parcel_pin,
      deeded_address: parcel.deeded_address,
      plaintext_pin: pin,
      claim_pin_hash,
      destination_url,
    });
  }

  const header = 'parcel_pin,deeded_address,plaintext_pin,claim_pin_hash,qr_destination_url';
  const csvLines = [
    header,
    ...rows.map((r) =>
      [
        escapeCsv(r.parcel_pin),
        escapeCsv(r.deeded_address),
        r.plaintext_pin,
        r.claim_pin_hash,
        escapeCsv(r.destination_url),
      ].join(',')
    ),
  ];

  return {
    csvContent: csvLines.join('\n'),
    rows,
  };
}

/**
 * Synchronize generated parcel PIN hashes into Supabase buffer_parcels table
 */
export async function persistManifestHashes(
  rows: MailManifestRow[],
  supabaseClient: any
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  let updatedCount = 0;
  for (const row of rows) {
    const { error } = await supabaseClient
      .schema('patchwork')
      .from('buffer_parcels')
      .update({
        claim_pin_hash: row.claim_pin_hash,
      })
      .eq('parcel_pin', row.parcel_pin);

    if (error) {
      return { success: false, updatedCount, error: error.message };
    }
    updatedCount++;
  }
  return { success: true, updatedCount };
}

