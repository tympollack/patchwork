'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  AttestedCaptureService,
  AttestedCaptureData,
  CaptureMetadata,
  ExposureValues,
} from '../../packages/mobile/src/services/AttestedCaptureService';

export interface AdPortCameraProps {
  initialLat?: number;
  initialLng?: number;
  onCapture?: (formData: FormData, captureData: AttestedCaptureData) => void;
  onError?: (err: Error) => void;
  className?: string;
  forceUnverified?: boolean;
}

export const AdPortCamera: React.FC<AdPortCameraProps> = ({
  initialLat = 37.774929,
  initialLng = -122.419416,
  onCapture,
  onError,
  className = '',
  forceUnverified = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lat, setLat] = useState<number>(initialLat);
  const [lng, setLng] = useState<number>(initialLng);
  const [ambientLux, setAmbientLux] = useState<number>(850);
  const [exposure, setExposure] = useState<ExposureValues>({
    iso: 100,
    shutterSpeed: 0.0166, // ~1/60s
    aperture: 2.8,
  });
  const [hardwareEnclaveEnabled, setHardwareEnclaveEnabled] = useState(!forceUnverified);
  const [lastCapture, setLastCapture] = useState<AttestedCaptureData | null>(null);

  // Monitor device orientation & ambient sensor if available
  useEffect(() => {
    if (typeof window !== 'undefined' && 'AmbientLightSensor' in window) {
      try {
        const sensor = new (window as any).AmbientLightSensor();
        sensor.addEventListener('reading', () => {
          if (sensor.illuminance !== undefined) {
            setAmbientLux(sensor.illuminance);
          }
        });
        sensor.start();
        return () => sensor.stop();
      } catch {
        // Fallback to exposure calculation
      }
    }
  }, []);

  // Update GPS coordinates if geolocation available
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => {
          // Use initial coordinates fallback
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  const liveLuminance = AttestedCaptureService.calculateLuminance(exposure, ambientLux);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const metadata: CaptureMetadata = {
        lat,
        lng,
        timestamp: Date.now(),
        ambientLux,
        exposure,
      };

      const captureData = await AttestedCaptureService.captureAndAttest(
        arrayBuffer,
        metadata,
        {
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          forceUnverified: !hardwareEnclaveEnabled,
        }
      );

      setLastCapture(captureData);

      const formData = AttestedCaptureService.packageMultipartPayload(captureData);
      if (onCapture) {
        onCapture(formData, captureData);
      }
    } catch (err: any) {
      if (onError) onError(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const triggerCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  return (
    <div
      data-testid="ad-port-camera-container"
      className={`tech-blueprint-camera bg-[#0A1128] text-white p-6 border border-[#6495ED] rounded font-sans ${className}`}
      style={{ backgroundColor: '#0A1128', borderColor: '#6495ED' }}
    >
      {/* Header telemetry band */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-[#6495ED]/40 mb-4">
        <div>
          <span className="text-[10px] tracking-widest text-[#6495ED] uppercase block font-mono">
            SYS: PW-CORRIDOR-CAM // v2.6.4
          </span>
          <h2 className="text-lg font-bold tracking-tight text-white uppercase">
            Hardware-Attested Ad Port Camera
          </h2>
        </div>

        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <span className="text-xs text-[#6495ED] font-mono">ENCLAVE:</span>
          <button
            type="button"
            data-testid="toggle-enclave-button"
            onClick={() => setHardwareEnclaveEnabled(!hardwareEnclaveEnabled)}
            className={`px-2 py-0.5 text-xs font-mono rounded border ${
              hardwareEnclaveEnabled
                ? 'bg-[#00FFFF]/10 border-[#00FFFF] text-[#00FFFF]'
                : 'bg-red-500/10 border-red-400 text-red-400'
            }`}
          >
            {hardwareEnclaveEnabled ? 'SECURE ENCLAVE [ARMED]' : 'UNVERIFIED [SIMULATED]'}
          </button>
        </div>
      </div>

      {/* Viewfinder crosshairs frame */}
      <div
        data-testid="viewfinder-frame"
        className="relative bg-black/40 border-2 border-dashed border-[#6495ED] rounded p-6 mb-4 flex flex-col items-center justify-center min-h-[200px]"
      >
        <div className="absolute top-2 left-2 text-[10px] font-mono text-[#6495ED]">
          GRID_RES: H3_RES8 // SPATIAL_READY
        </div>
        <div className="absolute top-2 right-2 text-[10px] font-mono text-[#00FFFF]">
          TARGET: BILLBOARD_CORRIDOR
        </div>

        <div className="text-center my-4">
          <p className="text-sm text-[#6495ED] font-sans mb-1">
            Sightline capture embeds cryptographic enclave signature & ambient lux telemetry.
          </p>
          <div className="font-mono text-xs text-[#00FFFF]">
            GPS: {lat.toFixed(6)}, {lng.toFixed(6)}
          </div>
        </div>

        {/* Hidden native input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          data-testid="ad-camera-file-input"
          onChange={handleFileChange}
          className="hidden"
          style={{ display: 'none' }}
        />

        <button
          type="button"
          data-testid="capture-button"
          disabled={isProcessing}
          onClick={triggerCapture}
          className="bg-[#00FFFF] hover:bg-[#00FFFF]/80 text-[#0A1128] font-bold text-sm px-6 py-2.5 rounded font-sans transition-all active:scale-95 disabled:opacity-50"
        >
          {isProcessing ? 'SIGNING ATTESTATION...' : 'CAPTURE AD AUDIT SIGHTLINE'}
        </button>
      </div>

      {/* Telemetry Monospace Readouts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 font-mono text-xs">
        <div className="bg-[#0A1128]/80 border border-[#6495ED]/30 p-2.5 rounded">
          <div className="text-[#6495ED] text-[10px] uppercase">Luminance Telemetry</div>
          <div className="text-[#00FFFF] font-bold text-sm mt-0.5" data-testid="telemetry-nits">
            {liveLuminance.estimatedNits} cd/m²
          </div>
          <div className="text-gray-400 text-[10px]">
            {liveLuminance.estimatedFootCandles} fc ({liveLuminance.estimatedLux} lux)
          </div>
        </div>

        <div className="bg-[#0A1128]/80 border border-[#6495ED]/30 p-2.5 rounded">
          <div className="text-[#6495ED] text-[10px] uppercase">Exposure Parameters</div>
          <div className="text-white mt-0.5">
            ISO {exposure.iso} | 1/{Math.round(1 / (exposure.shutterSpeed || 0.016))}s
          </div>
          <div className="text-gray-400 text-[10px]">f/{exposure.aperture} | SRC: {liveLuminance.source}</div>
        </div>

        <div className="bg-[#0A1128]/80 border border-[#6495ED]/30 p-2.5 rounded">
          <div className="text-[#6495ED] text-[10px] uppercase">Attestation Status</div>
          <div
            data-testid="attestation-status-badge"
            className={`font-bold mt-0.5 ${
              lastCapture
                ? lastCapture.attestation.status === 'VERIFIED_CAPTURE'
                  ? 'text-[#00FFFF]'
                  : 'text-red-400'
                : hardwareEnclaveEnabled
                ? 'text-[#00FFFF]'
                : 'text-amber-400'
            }`}
          >
            {lastCapture ? lastCapture.attestation.status : hardwareEnclaveEnabled ? 'READY (ENCLAVE)' : 'UNVERIFIED_CAPTURE'}
          </div>
          <div className="text-gray-400 text-[10px]">ECDSA-P256-SHA256</div>
        </div>
      </div>

      {/* Verification & Payload Summary */}
      {lastCapture && (
        <div
          data-testid="capture-result-box"
          className="border border-[#6495ED]/60 bg-black/60 p-4 rounded font-mono text-xs space-y-1.5"
        >
          <div className="text-[#00FFFF] font-bold border-b border-[#6495ED]/30 pb-1 flex justify-between">
            <span>ATTESTED TELEMETRY AUDIT RECORD</span>
            <span
              className={
                lastCapture.attestation.status === 'VERIFIED_CAPTURE'
                  ? 'text-[#00FFFF]'
                  : 'text-red-400'
              }
            >
              [{lastCapture.attestation.status}]
            </span>
          </div>
          <div className="truncate text-gray-300">
            <span className="text-[#6495ED]">IMAGE_SHA256: </span>
            <span data-testid="result-image-sha256">{lastCapture.attestation.imageSha256Hex}</span>
          </div>
          <div className="truncate text-gray-300">
            <span className="text-[#6495ED]">PAYLOAD_HASH: </span>
            <span data-testid="result-payload-hash">{lastCapture.attestation.payloadHashHex}</span>
          </div>
          <div className="truncate text-gray-300">
            <span className="text-[#6495ED]">SIGNATURE: </span>
            <span data-testid="result-signature">
              {lastCapture.attestation.signatureHex || 'NONE (UNVERIFIED_CAPTURE)'}
            </span>
          </div>
          <div className="text-gray-400 text-[10px] pt-1">
            TIMESTAMP: {lastCapture.metadata.timestamp} | NITS: {lastCapture.luminance.estimatedNits} cd/m²
          </div>
        </div>
      )}
    </div>
  );
};
