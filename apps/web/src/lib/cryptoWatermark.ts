/**
 * Client-side Cryptographic Checksum & Watermark Utilities
 * (TASK-PW-S3-WATERMARK-SYNC)
 */

export interface ImageHashResult {
  hex: string;
  base64: string;
}

/**
 * Compute raw image SHA-256 via window.crypto.subtle.digest
 */
export async function computeImageSha256(
  input: ArrayBuffer | Uint8Array | Blob
): Promise<ImageHashResult> {
  let buffer: ArrayBuffer;

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    buffer = await input.arrayBuffer();
  } else if (input instanceof Uint8Array) {
    const copy = new Uint8Array(input.byteLength);
    copy.set(input);
    buffer = copy.buffer as ArrayBuffer;
  } else {
    buffer = input as ArrayBuffer;
  }

  const cryptoObj =
    typeof window !== 'undefined' && window.crypto?.subtle
      ? window.crypto
      : typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
      ? globalThis.crypto
      : null;

  if (!cryptoObj) {
    throw new Error('Web Cryptography API (crypto.subtle) is unavailable in current environment.');
  }

  const digestBuffer = await cryptoObj.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Base64 format mandated for AWS S3 / Cloudflare R2 x-amz-checksum-sha256 header
  let binary = '';
  const bytes = new Uint8Array(digestBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(digestBuffer).toString('base64');

  return { hex, base64 };
}
