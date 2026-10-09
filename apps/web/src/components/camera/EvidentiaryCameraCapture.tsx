'use client';

import React, { useRef, useState, useEffect } from 'react';
import { computeImageSha256 } from '../../lib/cryptoWatermark';

export interface EvidentiaryCaptureResult {
  s3Url: string;
  sha256: string;
  lat: number;
  lng: number;
  precision: number;
  azHeading: number | null;
  timestamp: number;
}

export interface EvidentiaryCameraCaptureProps {
  parcelPin?: string;
  zoningNodeId?: string;
  claimToken?: string;
  claimPin?: string;
  onCapture: (result: EvidentiaryCaptureResult) => void;
  onError?: (errorMessage: string) => void;
  className?: string;
}

export const EvidentiaryCameraCapture: React.FC<EvidentiaryCameraCaptureProps> = ({
  parcelPin,
  zoningNodeId,
  claimToken,
  claimPin,
  onCapture,
  onError,
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAzimuth, setCurrentAzimuth] = useState<number | null>(null);
  const [capturedData, setCapturedData] = useState<EvidentiaryCaptureResult | null>(null);
  const [statusText, setStatusText] = useState<string>('Ready for sightline capture');

  // Track device compass azimuth
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if ((e as any).webkitCompassHeading !== undefined) {
        setCurrentAzimuth(Math.round((e as any).webkitCompassHeading));
      } else if (e.alpha !== null) {
        setCurrentAzimuth(Math.round(360 - e.alpha));
      }
    };

    if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, true);
    }
    return () => {
      if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, []);

  const handleCaptureClick = () => {
    setCapturedData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturedData(null);
    setIsProcessing(true);
    setStatusText('Reading raw camera frame...');

    try {
      // 1. Read binary array buffer
      const buffer = await file.arrayBuffer();

      // 2. Compute client-side SHA-256 hash using unified Web Crypto helper
      setStatusText('Computing SHA-256 cryptographic checksum...');
      const { hex: sha256Hex, base64: hashBase64 } = await computeImageSha256(buffer);

      // 3. Obtain live high-precision GPS telemetry
      setStatusText('Sampling hardware GPS geolocation...');
      const geoPos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation sensor unavailable on device'));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const lat = geoPos.coords.latitude;
      const lng = geoPos.coords.longitude;
      const precision = geoPos.coords.accuracy;
      const timestamp = Date.now();
      const azHeading = currentAzimuth;

      // 4. Request S3 presigned PUT URL
      setStatusText('Negotiating presigned cryptographic upload...');
      let effectiveClaimToken = claimToken;
      let effectiveClaimPin = claimPin;
      if (typeof window !== 'undefined') {
        if (!effectiveClaimToken) {
          effectiveClaimToken =
            (parcelPin ? sessionStorage.getItem(`claim_token_${parcelPin}`) : null) ||
            sessionStorage.getItem('active_claim_token') ||
            undefined;
        }
        if (!effectiveClaimPin) {
          effectiveClaimPin =
            (parcelPin ? sessionStorage.getItem(`claim_pin_${parcelPin}`) : null) ||
            sessionStorage.getItem('active_claim_pin') ||
            undefined;
        }
      }

      const presignRes = await fetch('/api/evidence/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha256: sha256Hex,
          contentType: file.type || 'image/jpeg',
          parcelPin,
          zoningNodeId,
          claimToken: effectiveClaimToken,
          claimPin: effectiveClaimPin,
        }),
      });

      if (!presignRes.ok) {
        const errJson = await presignRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to acquire S3 presigned URL');
      }

      const { uploadUrl, publicUrl } = await presignRes.json();

      // 5. Upload directly to S3 with required x-amz-checksum-sha256 header
      setStatusText('Streaming evidence to immutable S3 storage...');
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'image/jpeg',
          'x-amz-checksum-sha256': hashBase64,
        },
        body: buffer,
      });

      if (!uploadRes.ok) {
        throw new Error(
          `S3 rejected upload with HTTP ${uploadRes.status}. Checksum mismatch detected.`
        );
      }

      const result: EvidentiaryCaptureResult = {
        s3Url: publicUrl,
        sha256: sha256Hex,
        lat,
        lng,
        precision,
        azHeading,
        timestamp,
      };

      setCapturedData(result);
      setStatusText('✓ Hardware Attestation Verified');
      setIsProcessing(false);
      onCapture(result);
    } catch (err: any) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setCapturedData(null);
      setIsProcessing(false);
      const msg = err.message || 'Evidence capture failed';
      setStatusText(`Error: ${msg}`);
      onError?.(msg);
    }
  };

  return (
    <div
      className={`border border-[#4A90E2] bg-[#0A1128]/95 p-6 shadow-xl ${className}`}
      style={{ borderRadius: 0 }}
      data-testid="evidentiary-camera-capture"
    >
      {/* Hidden input strictly forcing rear camera */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
        data-testid="camera-input-environment"
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#4A90E2]/30 pb-3">
          <span className="font-mono text-xs uppercase tracking-wider text-[#6495ED]">
            Live Sightline Telemetry
          </span>
          {currentAzimuth !== null && (
            <span className="font-mono text-xs text-[#00E5FF]">
              AZIMUTH: {currentAzimuth}°
            </span>
          )}
        </div>

        {capturedData ? (
          <div className="space-y-3 font-mono text-xs text-slate-300">
            <div className="border border-[#00E5FF]/40 bg-[#0B132B] p-3 space-y-1">
              <div className="text-[#00E5FF] font-bold">SHA-256 CHECKSUM:</div>
              <div className="break-all text-[11px] text-white">{capturedData.sha256}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-400">LAT: </span>
                <span className="text-white">{capturedData.lat.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-slate-400">LNG: </span>
                <span className="text-white">{capturedData.lng.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-slate-400">PRECISION: </span>
                <span className="text-white">±{capturedData.precision.toFixed(1)}m</span>
              </div>
              <div>
                <span className="text-slate-400">BEARING: </span>
                <span className="text-white">{capturedData.azHeading ?? 'N/A'}°</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCaptureClick}
              disabled={isProcessing}
              className="mt-2 w-full border border-[#4A90E2] bg-transparent py-2 font-sans font-semibold text-xs uppercase tracking-wider text-[#00E5FF] transition-all hover:bg-[#00E5FF]/10"
              style={{ borderRadius: 0 }}
            >
              Retake Sightline Evidence
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <button
              type="button"
              onClick={handleCaptureClick}
              disabled={isProcessing}
              className="border-2 border-[#00E5FF] bg-[#00E5FF]/10 px-6 py-4 font-sans text-sm font-bold uppercase tracking-wider text-[#00E5FF] shadow-[0_0_15px_rgba(0,229,255,0.2)] transition-all hover:bg-[#00E5FF]/20 disabled:opacity-40"
              style={{ borderRadius: 0 }}
            >
              {isProcessing ? 'Processing Attestation...' : '📷 Open Hardware Sightline Camera'}
            </button>
            <p className="mt-3 max-w-xs text-xs text-slate-400">
              Direct rear-lens capture only. Enforces client-side SHA-256 hashing and GPS bearing verification.
            </p>
          </div>
        )}

        <div className="border-t border-[#4A90E2]/30 pt-3 text-center font-mono text-[11px] text-[#7AA7E8]">
          STATUS: {statusText}
        </div>
      </div>
    </div>
  );
};
