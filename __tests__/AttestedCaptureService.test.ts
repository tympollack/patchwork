import {
  AttestedCaptureService,
  CaptureMetadata,
} from '../packages/mobile/src/services/AttestedCaptureService';

describe('TASK-PW-HARDWARE-ATTEST: Secure Enclave Attestation & Luminance Telemetry', () => {
  const dummyImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3, 4, 5]);
  const dummyMeta: CaptureMetadata = {
    lat: 37.774929,
    lng: -122.419416,
    timestamp: 1731427200000,
    ambientLux: 1200,
    exposure: {
      iso: 200,
      shutterSpeed: 0.008,
      aperture: 2.8,
    },
  };

  describe('Luminance Telemetry', () => {
    it('calculates luminance from ambient light sensor reading', () => {
      const lum = AttestedCaptureService.calculateLuminance(undefined, 1000);
      expect(lum.source).toBe('ambient_sensor');
      expect(lum.estimatedLux).toBe(1000);
      expect(lum.estimatedFootCandles).toBeCloseTo(92.9, 1);
      expect(lum.estimatedNits).toBeCloseTo(318.31, 1);
    });

    it('calculates luminance from camera exposure parameters', () => {
      const lum = AttestedCaptureService.calculateLuminance({
        iso: 100,
        shutterSpeed: 0.01666, // ~1/60s
        aperture: 2.8,
      });
      expect(lum.source).toBe('camera_exposure');
      expect(lum.estimatedLux).toBeGreaterThan(0);
      expect(lum.estimatedNits).toBeGreaterThan(0);
      expect(lum.estimatedFootCandles).toBeGreaterThan(0);
    });

    it('falls back to calibrated daylight when telemetry is absent', () => {
      const lum = AttestedCaptureService.calculateLuminance();
      expect(lum.source).toBe('default_calibrated');
      expect(lum.estimatedLux).toBe(1000);
      expect(lum.estimatedNits).toBe(318.31);
    });
  });

  describe('Payload Hashing & Cryptographic Attestation', () => {
    it('computes distinct image SHA-256 and payload SHA-256 incorporating lat/lng/timestamp', async () => {
      const { payloadHashHex, imageSha256Hex } = await AttestedCaptureService.computeHashes(
        dummyImageBytes,
        dummyMeta.lat,
        dummyMeta.lng,
        dummyMeta.timestamp
      );

      expect(imageSha256Hex).toHaveLength(64);
      expect(payloadHashHex).toHaveLength(64);
      expect(payloadHashHex).not.toEqual(imageSha256Hex);
    });

    it('signs payload and flags as VERIFIED_CAPTURE with valid hardware keypair', async () => {
      const captureData = await AttestedCaptureService.captureAndAttest(dummyImageBytes, dummyMeta);

      expect(captureData.attestation.status).toBe('VERIFIED_CAPTURE');
      expect(captureData.attestation.isAttested).toBe(true);
      expect(captureData.attestation.signatureHex).toBeTruthy();
      expect(captureData.attestation.publicKeyHex).toBeTruthy();
      expect(captureData.attestation.imageSha256Hex).toHaveLength(64);

      // Verify that the signature verifies against the exact payload
      const isValid = await AttestedCaptureService.verifyAttestation(
        dummyImageBytes,
        dummyMeta.lat,
        dummyMeta.lng,
        dummyMeta.timestamp,
        captureData.attestation.signatureHex,
        captureData.attestation.publicKeyHex
      );
      expect(isValid).toBe(true);
    });

    it('flags capture as UNVERIFIED_CAPTURE when signature is forced or hardware key absent', async () => {
      const captureData = await AttestedCaptureService.captureAndAttest(dummyImageBytes, dummyMeta, {
        forceUnverified: true,
      });

      expect(captureData.attestation.status).toBe('UNVERIFIED_CAPTURE');
      expect(captureData.attestation.isAttested).toBe(false);
      expect(captureData.attestation.signatureHex).toBeNull();
    });

    it('fails attestation verification if image bytes or telemetry are tampered with', async () => {
      const captureData = await AttestedCaptureService.captureAndAttest(dummyImageBytes, dummyMeta);

      const tamperedBytes = new Uint8Array(dummyImageBytes);
      tamperedBytes[0] = 0; // tamper

      const isValidTamperedBytes = await AttestedCaptureService.verifyAttestation(
        tamperedBytes,
        dummyMeta.lat,
        dummyMeta.lng,
        dummyMeta.timestamp,
        captureData.attestation.signatureHex,
        captureData.attestation.publicKeyHex
      );
      expect(isValidTamperedBytes).toBe(false);

      const isValidTamperedCoords = await AttestedCaptureService.verifyAttestation(
        dummyImageBytes,
        dummyMeta.lat + 0.001, // tamper latitude
        dummyMeta.lng,
        dummyMeta.timestamp,
        captureData.attestation.signatureHex,
        captureData.attestation.publicKeyHex
      );
      expect(isValidTamperedCoords).toBe(false);
    });
  });

  describe('Multipart Payload Packaging', () => {
    it('packages all required fields and metadata into FormData', async () => {
      const captureData = await AttestedCaptureService.captureAndAttest(dummyImageBytes, dummyMeta);
      const formData = AttestedCaptureService.packageMultipartPayload(captureData);

      expect(formData.get('payload_hash')).toBe(captureData.attestation.payloadHashHex);
      expect(formData.get('image_sha256')).toBe(captureData.attestation.imageSha256Hex);
      expect(formData.get('signature')).toBe(captureData.attestation.signatureHex);
      expect(formData.get('status')).toBe('VERIFIED_CAPTURE');
      expect(formData.get('latitude')).toBe(String(dummyMeta.lat));
      expect(formData.get('longitude')).toBe(String(dummyMeta.lng));
      expect(formData.get('luminance_nits')).toBe(String(captureData.luminance.estimatedNits));

      const telemetryRaw = formData.get('telemetry') as string;
      const telemetryParsed = JSON.parse(telemetryRaw);
      expect(telemetryParsed.metadata.lat).toBe(dummyMeta.lat);
      expect(telemetryParsed.attestation.status).toBe('VERIFIED_CAPTURE');
    });
  });
});
