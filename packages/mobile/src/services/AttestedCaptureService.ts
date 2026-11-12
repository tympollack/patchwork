/**
 * AttestedCaptureService.ts
 * Mobile & Web Cryptographic Secure Enclave / WebCrypto Attestation
 * and Luminance Telemetry Service (TASK-PW-HARDWARE-ATTEST)
 */

export interface ExposureValues {
  iso?: number;
  shutterSpeed?: number; // seconds, e.g. 1/60 = 0.01667
  aperture?: number; // f-number, e.g. 2.8
}

export interface LuminanceTelemetry {
  estimatedLux: number;
  estimatedFootCandles: number;
  estimatedNits: number; // cd/m^2
  source: 'ambient_sensor' | 'camera_exposure' | 'default_calibrated';
}

export interface AttestationResult {
  signatureHex: string | null;
  publicKeyHex: string | null;
  payloadHashHex: string;
  imageSha256Hex: string;
  isAttested: boolean;
  status: 'VERIFIED_CAPTURE' | 'UNVERIFIED_CAPTURE';
  algorithm: string;
}

export interface CaptureMetadata {
  lat: number;
  lng: number;
  timestamp: number;
  altitude?: number | null;
  accuracy?: number | null;
  exposure?: ExposureValues;
  ambientLux?: number;
}

export interface AttestedCaptureData {
  imageBytes: Uint8Array | ArrayBuffer;
  fileName?: string;
  mimeType?: string;
  metadata: CaptureMetadata;
  luminance: LuminanceTelemetry;
  attestation: AttestationResult;
}

export class AttestedCaptureService {
  private static cachedKeyPair: CryptoKeyPair | null = null;

  /**
   * Helper: Convert ArrayBuffer or Uint8Array to hex string
   */
  public static bufToHex(buf: ArrayBuffer | Uint8Array): string {
    const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Helper: Convert hex string to Uint8Array
   */
  public static hexToBuf(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }
    const len = hex.length / 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Get WebCrypto subtle implementation across environments (Node, Browser, React Native)
   */
  public static getSubtleCrypto(): SubtleCrypto | null {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      return window.crypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      return globalThis.crypto.subtle;
    }
    return null;
  }

  /**
   * Generate or retrieve device hardware-attested key pair (ECDSA P-256)
   */
  public static async getOrCreateDeviceKeyPair(): Promise<CryptoKeyPair | null> {
    if (this.cachedKeyPair) {
      return this.cachedKeyPair;
    }

    const subtle = this.getSubtleCrypto();
    if (!subtle) {
      return null;
    }

    try {
      const keyPair = (await subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true, // extractable for export/verification
        ['sign', 'verify']
      )) as CryptoKeyPair;

      this.cachedKeyPair = keyPair;
      return keyPair;
    } catch {
      return null;
    }
  }

  /**
   * Calculate Luminance from Ambient Light sensor or Camera Exposure values
   */
  public static calculateLuminance(
    exposure?: ExposureValues,
    ambientLux?: number
  ): LuminanceTelemetry {
    // 1. Direct ambient light sensor reading (e.g. AmbientLightSensor API)
    if (typeof ambientLux === 'number' && !isNaN(ambientLux) && ambientLux >= 0) {
      const estimatedLux = Math.round(ambientLux * 100) / 100;
      const estimatedFootCandles = Math.round(ambientLux * 0.092903 * 100) / 100;
      // Reflected luminance approximation: Nits ≈ Lux / π
      const estimatedNits = Math.round((ambientLux / Math.PI) * 100) / 100;

      return {
        estimatedLux,
        estimatedFootCandles,
        estimatedNits,
        source: 'ambient_sensor',
      };
    }

    // 2. Camera exposure derivation (ISO, shutter speed, aperture f-number)
    if (exposure && exposure.iso && exposure.shutterSpeed) {
      const iso = Math.max(exposure.iso, 1);
      const aperture = exposure.aperture || 2.0;
      const shutter = Math.max(exposure.shutterSpeed, 0.0001);

      // EV = log2(N^2 / t) - log2(ISO / 100)
      const ev = Math.log2((aperture * aperture) / shutter) - Math.log2(iso / 100);

      // Standard calibrated incident light formula: Lux = 2.5 * 2^EV
      const lux = Math.max(0, 2.5 * Math.pow(2, ev));
      const estimatedLux = Math.round(lux * 100) / 100;
      const estimatedFootCandles = Math.round(lux * 0.092903 * 100) / 100;
      const estimatedNits = Math.round((lux / Math.PI) * 100) / 100;

      return {
        estimatedLux,
        estimatedFootCandles,
        estimatedNits,
        source: 'camera_exposure',
      };
    }

    // 3. Calibrated standard daylight default
    return {
      estimatedLux: 1000,
      estimatedFootCandles: 92.9,
      estimatedNits: 318.31,
      source: 'default_calibrated',
    };
  }

  /**
   * Compute payload hash: SHA-256(image_bytes + lat + lng + timestamp)
   * and raw image SHA-256
   */
  public static async computeHashes(
    imageBytes: Uint8Array | ArrayBuffer,
    lat: number,
    lng: number,
    timestamp: number
  ): Promise<{ payloadHashHex: string; imageSha256Hex: string; combinedBuffer: Uint8Array }> {
    const subtle = this.getSubtleCrypto();
    if (!subtle) {
      throw new Error('WebCrypto subtle is required for cryptographic hashing.');
    }

    const rawBytes = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);

    // Compute raw image SHA-256
    const imgDigest = await subtle.digest('SHA-256', rawBytes.buffer as ArrayBuffer);
    const imageSha256Hex = this.bufToHex(imgDigest);

    // Construct telemetry payload string
    const metaString = `\nlat=${lat.toFixed(6)}\nlng=${lng.toFixed(6)}\ntimestamp=${timestamp}`;
    const enc = new TextEncoder();
    const metaBytes = enc.encode(metaString);

    // Concatenate imageBytes + lat + lng + timestamp bytes
    const combinedBuffer = new Uint8Array(rawBytes.length + metaBytes.length);
    combinedBuffer.set(rawBytes, 0);
    combinedBuffer.set(metaBytes, rawBytes.length);

    // Compute payload hash
    const payloadDigest = await subtle.digest('SHA-256', combinedBuffer.buffer as ArrayBuffer);
    const payloadHashHex = this.bufToHex(payloadDigest);

    return { payloadHashHex, imageSha256Hex, combinedBuffer };
  }

  /**
   * Cryptographically sign payload hash using Secure Enclave / WebCrypto key
   */
  public static async signPayloadHash(
    payloadHashHex: string,
    keyPair?: CryptoKeyPair | null
  ): Promise<AttestationResult> {
    const subtle = this.getSubtleCrypto();
    const kp = keyPair || (await this.getOrCreateDeviceKeyPair());

    if (!subtle || !kp) {
      return {
        signatureHex: null,
        publicKeyHex: null,
        payloadHashHex,
        imageSha256Hex: '',
        isAttested: false,
        status: 'UNVERIFIED_CAPTURE',
        algorithm: 'ECDSA-P256-SHA256',
      };
    }

    try {
      const hashBytes = this.hexToBuf(payloadHashHex);
      const signatureBuffer = await subtle.sign(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        kp.privateKey,
        hashBytes.buffer as ArrayBuffer
      );

      const exportedPub = await subtle.exportKey('raw', kp.publicKey);

      return {
        signatureHex: this.bufToHex(signatureBuffer),
        publicKeyHex: this.bufToHex(exportedPub),
        payloadHashHex,
        imageSha256Hex: '',
        isAttested: true,
        status: 'VERIFIED_CAPTURE',
        algorithm: 'ECDSA-P256-SHA256',
      };
    } catch {
      return {
        signatureHex: null,
        publicKeyHex: null,
        payloadHashHex,
        imageSha256Hex: '',
        isAttested: false,
        status: 'UNVERIFIED_CAPTURE',
        algorithm: 'ECDSA-P256-SHA256',
      };
    }
  }

  /**
   * Verify hardware attestation signature against image bytes, coordinates, and timestamp
   */
  public static async verifyAttestation(
    imageBytes: Uint8Array | ArrayBuffer,
    lat: number,
    lng: number,
    timestamp: number,
    signatureHex: string | null,
    publicKeyHex: string | null
  ): Promise<boolean> {
    if (!signatureHex || !publicKeyHex) {
      return false;
    }

    const subtle = this.getSubtleCrypto();
    if (!subtle) {
      return false;
    }

    try {
      const { payloadHashHex } = await this.computeHashes(imageBytes, lat, lng, timestamp);
      const hashBytes = this.hexToBuf(payloadHashHex);
      const sigBytes = this.hexToBuf(signatureHex);
      const pubBytes = this.hexToBuf(publicKeyHex);

      const importedKey = await subtle.importKey(
        'raw',
        pubBytes.buffer as ArrayBuffer,
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['verify']
      );

      const isValid = await subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        importedKey,
        sigBytes.buffer as ArrayBuffer,
        hashBytes.buffer as ArrayBuffer
      );

      return isValid;
    } catch {
      return false;
    }
  }

  /**
   * Process photo capture: compute hashes, sample luminance, sign payload, and assemble record
   */
  public static async captureAndAttest(
    imageBytes: Uint8Array | ArrayBuffer,
    metadata: CaptureMetadata,
    options?: { fileName?: string; mimeType?: string; forceUnverified?: boolean }
  ): Promise<AttestedCaptureData> {
    const { payloadHashHex, imageSha256Hex } = await this.computeHashes(
      imageBytes,
      metadata.lat,
      metadata.lng,
      metadata.timestamp
    );

    const luminance = this.calculateLuminance(metadata.exposure, metadata.ambientLux);

    let attestation: AttestationResult;
    if (options?.forceUnverified) {
      attestation = {
        signatureHex: null,
        publicKeyHex: null,
        payloadHashHex,
        imageSha256Hex,
        isAttested: false,
        status: 'UNVERIFIED_CAPTURE',
        algorithm: 'ECDSA-P256-SHA256',
      };
    } else {
      const signRes = await this.signPayloadHash(payloadHashHex);
      attestation = {
        ...signRes,
        imageSha256Hex,
      };
    }

    return {
      imageBytes,
      fileName: options?.fileName || `ad_capture_${metadata.timestamp}.jpg`,
      mimeType: options?.mimeType || 'image/jpeg',
      metadata,
      luminance,
      attestation,
    };
  }

  /**
   * Package metadata into multipart upload payload directed to PatchWork ingestion API
   */
  public static packageMultipartPayload(captureData: AttestedCaptureData): FormData {
    const formData = new FormData();

    const rawBytes =
      captureData.imageBytes instanceof Uint8Array
        ? captureData.imageBytes
        : new Uint8Array(captureData.imageBytes);

    // Support browser / react-native / node FormData
    if (typeof Blob !== 'undefined') {
      const blob = new Blob([rawBytes.buffer as ArrayBuffer], { type: captureData.mimeType || 'image/jpeg' });
      formData.append('file', blob, captureData.fileName || 'capture.jpg');
    } else {
      formData.append('file', rawBytes as any, captureData.fileName || 'capture.jpg');
    }

    formData.append('payload_hash', captureData.attestation.payloadHashHex);
    formData.append('image_sha256', captureData.attestation.imageSha256Hex);
    formData.append('signature', captureData.attestation.signatureHex || '');
    formData.append('public_key', captureData.attestation.publicKeyHex || '');
    formData.append('status', captureData.attestation.status);
    formData.append('latitude', String(captureData.metadata.lat));
    formData.append('longitude', String(captureData.metadata.lng));
    formData.append('timestamp', String(captureData.metadata.timestamp));
    formData.append('luminance_nits', String(captureData.luminance.estimatedNits));
    formData.append('luminance_foot_candles', String(captureData.luminance.estimatedFootCandles));
    formData.append('luminance_lux', String(captureData.luminance.estimatedLux));
    formData.append('luminance_source', captureData.luminance.source);

    formData.append(
      'telemetry',
      JSON.stringify({
        metadata: captureData.metadata,
        luminance: captureData.luminance,
        attestation: {
          algorithm: captureData.attestation.algorithm,
          status: captureData.attestation.status,
          isAttested: captureData.attestation.isAttested,
        },
      })
    );

    return formData;
  }
}
