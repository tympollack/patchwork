'use client';

import React, { useState } from 'react';
import {
  EvidentiaryCameraCapture,
  EvidentiaryCaptureResult,
} from '../camera/EvidentiaryCameraCapture';
import {
  commitVarianceAudit,
  CommitVarianceAuditResult,
  BufferStatusType,
} from '../../actions/commitVarianceAudit';

export interface VarianceAuditFormProps {
  initialParcelPin?: string;
  zoningNodeId?: string;
  bufferParcelId?: string;
  onSuccess?: (result: CommitVarianceAuditResult) => void;
  className?: string;
}

const BUFFER_STATUS_OPTIONS: { value: BufferStatusType; label: string; desc: string }[] = [
  { value: 'Intact', label: 'INTACT', desc: 'Vegetative buffer undisturbed, no grading variance' },
  { value: 'Degraded', label: 'DEGRADED', desc: 'Canopy thinning or minor ground cover disturbance' },
  { value: 'Encroached', label: 'ENCROACHED', desc: 'Direct clearing, vehicle ruts, or grading violation' },
];

const EROSION_INDEX_OPTIONS = [
  { level: 1, label: '1 - Minimal', color: 'border-cyan-500/40 text-cyan-400' },
  { level: 2, label: '2 - Slight', color: 'border-blue-400/40 text-blue-300' },
  { level: 3, label: '3 - Moderate', color: 'border-amber-400/40 text-amber-300' },
  { level: 4, label: '4 - Severe', color: 'border-orange-500/50 text-orange-400' },
  { level: 5, label: '5 - Critical', color: 'border-red-500/60 text-red-400' },
];

export const VarianceAuditForm: React.FC<VarianceAuditFormProps> = ({
  initialParcelPin = '',
  zoningNodeId,
  bufferParcelId,
  onSuccess,
  className = '',
}) => {
  const [parcelPin, setParcelPin] = useState<string>(initialParcelPin);
  const [setbackDistance, setSetbackDistance] = useState<string>('');
  const [bufferStatus, setBufferStatus] = useState<BufferStatusType>('Intact');
  const [drainageErosionIndex, setDrainageErosionIndex] = useState<number>(1);
  const [observableImpact, setObservableImpact] = useState<string>('');
  const [captureResult, setCaptureResult] = useState<EvidentiaryCaptureResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CommitVarianceAuditResult | null>(null);

  const maxChars = 180;
  const remainingChars = maxChars - observableImpact.length;

  const handleCaptureComplete = (result: EvidentiaryCaptureResult) => {
    setCaptureResult(result);
    setErrorMessage(null);
  };

  const handleCaptureError = (err: string) => {
    setCaptureResult(null);
    setErrorMessage(err);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Validate Parcel PIN
    if (!parcelPin.trim()) {
      setErrorMessage('Parcel PIN is required.');
      return;
    }

    // 2. Validate numeric setback boundaries (Acceptance Criteria)
    const setbackNum = parseFloat(setbackDistance);
    if (isNaN(setbackNum) || setbackNum <= 0 || !isFinite(setbackNum)) {
      setErrorMessage('Setback distance must be a valid positive number of feet.');
      return;
    }

    // 3. Block submission if no camera capture checksum is attached (Acceptance Criteria)
    if (!captureResult || !captureResult.sha256) {
      setErrorMessage(
        'Verified sightline camera capture with SHA-256 checksum is required prior to submission.'
      );
      return;
    }

    // 4. Validate observable impact summary
    if (!observableImpact.trim()) {
      setErrorMessage('Observable impact summary must not be empty.');
      return;
    }

    if (observableImpact.trim().length > maxChars) {
      setErrorMessage(`Observable impact summary exceeds ${maxChars} characters.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await commitVarianceAudit({
        parcelPin: parcelPin.trim(),
        setbackDistanceFt: setbackNum,
        bufferStatus,
        drainageErosionIndex,
        observableImpact: observableImpact.trim(),
        evidenceS3Url: captureResult.s3Url,
        evidenceSha256: captureResult.sha256,
        zoningNodeId,
        bufferParcelId,
        lat: captureResult.lat,
        lng: captureResult.lng,
        azHeading: captureResult.azHeading,
        gpsPrecisionM: captureResult.precision,
        capturedAt: new Date(captureResult.timestamp).toISOString(),
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to submit environmental variance audit.');
        setIsSubmitting(false);
        return;
      }

      setConfirmation(result);
      setIsSubmitting(false);
      onSuccess?.(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Audit submission failure');
      setIsSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div
        className={`border-2 border-[#00E5FF] bg-[#0A1128]/95 p-8 text-center shadow-[0_0_25px_rgba(0,229,255,0.15)] ${className}`}
        style={{ borderRadius: 0 }}
        data-testid="variance-audit-confirmation"
      >
        <div className="font-mono text-xs uppercase tracking-widest text-[#00E5FF]">
          ✓ Environmental Field Audit Committed & Attested
        </div>
        <h2 className="mt-3 text-2xl font-bold uppercase tracking-tight text-white font-sans">
          Topographic Variance Record Sealed
        </h2>

        <div className="mx-auto mt-6 max-w-lg space-y-4 text-left font-mono text-xs">
          <div className="border border-[#4A90E2]/40 bg-[#0B132B] p-4 space-y-2">
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">FILING REF:</span>
              <span className="font-bold text-[#00E5FF] text-sm">{confirmation.filingRef}</span>
            </div>
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">PARCEL PIN:</span>
              <span className="text-white font-bold">{parcelPin}</span>
            </div>
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">OBSERVED SETBACK:</span>
              <span className="text-cyan-300 font-bold">{setbackDistance} FT</span>
            </div>
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">BUFFER STATUS:</span>
              <span className="text-white uppercase font-bold">{bufferStatus}</span>
            </div>
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">EROSION INDEX:</span>
              <span className="text-amber-400 font-bold">{drainageErosionIndex} / 5</span>
            </div>
            <div className="pt-1">
              <span className="text-slate-400 block mb-1">PERMANENT SHA-256 CHECKSUM:</span>
              <span className="break-all text-[11px] text-[#00E5FF] block bg-black/40 p-2">
                {confirmation.sha256}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400 max-w-md mx-auto font-sans">
          Your attested field survey has been permanently committed to the civic zoning buffer ledger.
        </p>

        <button
          type="button"
          onClick={() => { setConfirmation(null); setSetbackDistance(''); setObservableImpact(''); setCaptureResult(null); }}
          className="mt-6 inline-block border border-[#4A90E2] bg-transparent px-6 py-2.5 font-sans font-semibold text-xs uppercase tracking-wider text-[#00E5FF] transition-all hover:bg-[#00E5FF]/10 cursor-pointer"
          style={{ borderRadius: 0 }}
        >
          Submit Another Survey
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`border border-[#4A90E2] bg-[#0A1128]/95 p-6 sm:p-8 shadow-xl space-y-6 ${className}`}
      style={{ borderRadius: 0 }}
      data-testid="variance-audit-form"
    >
      <div>
        <h2 className="text-xl font-bold uppercase tracking-wider text-white font-sans">
          Environmental & Setback Audit Form
        </h2>
        <p className="mt-1 text-xs text-[#7AA7E8] font-sans">
          Statutory Topographic Variance Survey • Setback & Vegetative Buffer Assessment
        </p>
      </div>

      {/* 1. Parcel PIN Input */}
      <div>
        <label
          htmlFor="parcel-pin-input"
          className="font-mono text-xs uppercase tracking-wider text-[#6495ED] block mb-2"
        >
          Target Parcel PIN (Required)
        </label>
        <input
          id="parcel-pin-input"
          type="text"
          value={parcelPin}
          onChange={(e) => {
            setParcelPin(e.target.value.toUpperCase());
            setCaptureResult(null);
          }}
          placeholder="e.g. PIN-550-84-01"
          disabled={isSubmitting}
          className="w-full border border-[#4A90E2] bg-[#0B132B] p-3 font-mono text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-[#00E5FF] focus:shadow-[0_0_10px_rgba(0,229,255,0.2)]"
          style={{ borderRadius: 0 }}
        />
      </div>

      {/* 2. Numeric Setback Distance */}
      <div>
        <label
          htmlFor="setback-distance-input"
          className="font-mono text-xs uppercase tracking-wider text-[#6495ED] block mb-2"
        >
          Observed Setback Distance (Feet)
        </label>
        <div className="relative">
          <input
            id="setback-distance-input"
            type="number"
            step="0.1"
            min="0.1"
            value={setbackDistance}
            onChange={(e) => setSetbackDistance(e.target.value)}
            placeholder="e.g. 35.5"
            disabled={isSubmitting}
            className="w-full border border-[#4A90E2] bg-[#0B132B] p-3 pr-12 font-mono text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-[#00E5FF] focus:shadow-[0_0_10px_rgba(0,229,255,0.2)]"
            style={{ borderRadius: 0 }}
          />
          <span className="absolute right-3 top-3 font-mono text-xs text-[#6495ED]">FT</span>
        </div>
      </div>

      {/* 3. Buffer Status (Intact, Degraded, Encroached) */}
      <div>
        <label className="font-mono text-xs uppercase tracking-wider text-[#6495ED] block mb-2">
          Vegetative Buffer Setback Status
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {BUFFER_STATUS_OPTIONS.map((opt) => {
            const isSelected = bufferStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBufferStatus(opt.value)}
                disabled={isSubmitting}
                className={`p-3 text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#00E5FF] bg-[#00E5FF]/10 text-white shadow-[0_0_10px_rgba(0,229,255,0.2)]'
                    : 'border-[#4A90E2]/40 bg-[#0B132B] text-slate-300 hover:border-[#6495ED]'
                }`}
                style={{ borderRadius: 0 }}
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-block w-2.5 h-2.5 border ${
                      isSelected ? 'border-[#00E5FF] bg-[#00E5FF]' : 'border-slate-500'
                    }`}
                  />
                  <span className="font-mono text-xs font-bold">{opt.label}</span>
                </div>
                <p className="mt-1 font-sans text-[11px] text-slate-400 leading-tight">
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Drainage Erosion Index (1-5) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="font-mono text-xs uppercase tracking-wider text-[#6495ED]">
            Drainage Erosion Severity Index (1 - 5)
          </label>
          <span className="font-mono text-xs text-[#00E5FF]">
            SELECTED: {drainageErosionIndex} / 5
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {EROSION_INDEX_OPTIONS.map((opt) => {
            const isSelected = drainageErosionIndex === opt.level;
            return (
              <button
                key={opt.level}
                type="button"
                onClick={() => setDrainageErosionIndex(opt.level)}
                disabled={isSubmitting}
                className={`py-2.5 px-1 text-center border font-mono text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#00E5FF] bg-[#00E5FF] text-[#0A1128] shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                    : `bg-[#0B132B] hover:border-[#6495ED] ${opt.color}`
                }`}
                style={{ borderRadius: 0 }}
              >
                {opt.level}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Hardware Sightline Camera Integration */}
      <div>
        <label className="font-mono text-xs uppercase tracking-wider text-[#6495ED] block mb-2">
          Hardware Sightline Photographic Capture (Mandatory)
        </label>
        <EvidentiaryCameraCapture
          parcelPin={parcelPin}
          zoningNodeId={zoningNodeId}
          onCapture={handleCaptureComplete}
          onError={handleCaptureError}
        />
      </div>

      {/* 6. Observable Impact Summary (Max 240 chars) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="impact-summary-input"
            className="font-mono text-xs uppercase tracking-wider text-[#6495ED]"
          >
            Observable Impact Summary (Max 240 Chars)
          </label>
          <span
            className={`font-mono text-xs ${
              remainingChars < 20 ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            {observableImpact.length} / {maxChars}
          </span>
        </div>
        <textarea
          id="impact-summary-input"
          value={observableImpact}
          maxLength={maxChars}
          disabled={isSubmitting}
          onChange={(e) => setObservableImpact(e.target.value)}
          rows={3}
          placeholder="State observable setback encroachment, slope degradation, or erosion patterns observed along parcel boundary."
          className="w-full border border-[#4A90E2] bg-[#0B132B] p-3 font-sans text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-[#00E5FF] focus:shadow-[0_0_10px_rgba(0,229,255,0.2)] disabled:opacity-40"
          style={{ borderRadius: 0 }}
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="border border-red-500/80 bg-red-950/40 p-3 font-mono text-xs text-red-200"
          style={{ borderRadius: 0 }}
        >
          {errorMessage}
        </div>
      )}

      {/* 7. Submit Action Button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full border-2 border-[#00E5FF] bg-[#00E5FF] py-3.5 font-sans font-bold text-xs uppercase tracking-widest text-[#0A1128] shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all hover:bg-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        style={{ borderRadius: 0 }}
      >
        {isSubmitting ? 'Sealing Environmental Audit...' : 'Submit Environmental Field Audit'}
      </button>
    </form>
  );
};
