'use client';

import React, { useState } from 'react';
import { CodeSectionRadioGroup } from './CodeSectionRadioGroup';
import {
  EvidentiaryCameraCapture,
  EvidentiaryCaptureResult,
} from '../camera/EvidentiaryCameraCapture';
import { commitAffidavit, CommitAffidavitResult } from '../../actions/commitAffidavit';

export interface AffidavitDiagnosticFormProps {
  zoningNodeId: string;
  bufferParcelId?: string;
  parcelPin?: string;
  onSuccess?: (result: CommitAffidavitResult) => void;
  className?: string;
}

export const AffidavitDiagnosticForm: React.FC<AffidavitDiagnosticFormProps> = ({
  zoningNodeId,
  bufferParcelId,
  parcelPin,
  onSuccess,
  className = '',
}) => {
  const [codeSection, setCodeSection] = useState<string>('§14-A');
  const [narrative, setNarrative] = useState<string>('');
  const [captureResult, setCaptureResult] = useState<EvidentiaryCaptureResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<CommitAffidavitResult | null>(null);

  const maxChars = 240;
  const remainingChars = maxChars - narrative.length;

  const handleCaptureComplete = (result: EvidentiaryCaptureResult) => {
    setCaptureResult(result);
    setErrorMessage(null);
  };

  const handleCaptureError = (err: string) => {
    // Clear previous capture if a retake fails
    setCaptureResult(null);
    setErrorMessage(err);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!codeSection) {
      setErrorMessage('Please select a municipal violation code section.');
      return;
    }

    if (!captureResult) {
      setErrorMessage('Verified sightline photographic capture is strictly required prior to filing.');
      return;
    }

    if (!narrative.trim()) {
      setErrorMessage('Physical impact summary must not be empty.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await commitAffidavit({
        zoningNodeId,
        bufferParcelId,
        codeSection,
        narrativeSummary: narrative.trim(),
        evidenceS3Url: captureResult.s3Url,
        evidenceSha256: captureResult.sha256,
        lat: captureResult.lat,
        lng: captureResult.lng,
        azHeading: captureResult.azHeading,
        gpsPrecisionM: captureResult.precision,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to submit impact affidavit.');
        setIsSubmitting(false);
        return;
      }

      setConfirmation(result);
      setIsSubmitting(false);
      onSuccess?.(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Evidentiary commitment failure');
      setIsSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div
        className={`border-2 border-[#00E5FF] bg-[#0A1128]/95 p-8 text-center shadow-[0_0_25px_rgba(0,229,255,0.15)] ${className}`}
        style={{ borderRadius: 0 }}
        data-testid="affidavit-confirmation"
      >
        <div className="font-mono text-xs uppercase tracking-widest text-[#00E5FF]">
          ✓ Statutory Filing Committed & Authenticated
        </div>
        <h2 className="mt-3 text-2xl font-bold uppercase tracking-tight text-white font-sans">
          Affidavit Record Sealed
        </h2>

        <div className="mx-auto mt-6 max-w-lg space-y-4 text-left font-mono text-xs">
          <div className="border border-[#4A90E2]/40 bg-[#0B132B] p-4 space-y-2">
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">FILING REFERENCE:</span>
              <span className="font-bold text-[#00E5FF] text-sm">{confirmation.filingRef}</span>
            </div>
            <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
              <span className="text-slate-400">VIOLATION SECTION:</span>
              <span className="text-white font-bold">{codeSection}</span>
            </div>
            {parcelPin && (
              <div className="flex justify-between border-b border-[#4A90E2]/30 pb-2">
                <span className="text-slate-400">PARCEL PIN:</span>
                <span className="text-white">{parcelPin}</span>
              </div>
            )}
            <div className="pt-1">
              <span className="text-slate-400 block mb-1">PERMANENT SHA-256 CHECKSUM:</span>
              <span className="break-all text-[11px] text-[#00E5FF] block bg-black/40 p-2">
                {confirmation.sha256}
              </span>
            </div>
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-400 max-w-md mx-auto font-sans">
          Your attested filing has been locked into the municipal evidentiary docket. It will appear directly inside the certified Board of Zoning Appeals legal brief.
        </p>

        <a
          href={`/audit/${zoningNodeId}`}
          className="mt-6 inline-block border border-[#4A90E2] bg-transparent px-6 py-2.5 font-sans font-semibold text-xs uppercase tracking-wider text-[#00E5FF] transition-all hover:bg-[#00E5FF]/10"
          style={{ borderRadius: 0 }}
        >
          Return to Buffer Ledger
        </a>
      </div>
    );
  }

  const isFormValid = Boolean(codeSection && captureResult && narrative.trim());

  return (
    <form
      onSubmit={handleSubmit}
      className={`border border-[#4A90E2] bg-[#0A1128]/95 p-6 sm:p-8 shadow-xl space-y-6 ${className}`}
      style={{ borderRadius: 0 }}
      data-testid="affidavit-diagnostic-form"
    >
      <div>
        <h2 className="text-xl font-bold uppercase tracking-wider text-white font-sans">
          Statutory Impact Affidavit Intake
        </h2>
        <p className="mt-1 text-xs text-[#7AA7E8] font-sans">
          Municipal Code Chapter 14 Civic Evidentiary Filing • Hamilton County BZA Docket
        </p>
      </div>

      {/* 1. Municipal Code Selector */}
      <CodeSectionRadioGroup
        value={codeSection}
        onChange={setCodeSection}
        disabled={isSubmitting}
      />

      {/* 2. Hardware Sightline Camera */}
      <div>
        <label className="font-mono text-xs uppercase tracking-wider text-[#6495ED] block mb-2">
          Evidentiary Sightline Capture (Mandatory)
        </label>
        <EvidentiaryCameraCapture
          parcelPin={parcelPin}
          zoningNodeId={zoningNodeId}
          onCapture={handleCaptureComplete}
          onError={handleCaptureError}
        />
      </div>

      {/* 3. Strict 240-Character Narrative */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor="narrative"
            className="font-mono text-xs uppercase tracking-wider text-[#6495ED]"
          >
            Physical Impact Summary (Observable Encroachment Only)
          </label>
          <span
            className={`font-mono text-xs ${
              remainingChars < 20 ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
          >
            {narrative.length} / {maxChars}
          </span>
        </div>
        <textarea
          id="narrative"
          value={narrative}
          maxLength={maxChars}
          disabled={isSubmitting}
          onChange={(e) => setNarrative(e.target.value)}
          rows={3}
          placeholder="State direct observable impact (e.g. 18-foot grading encroachment inside 500-ft buffer line causing erosion runoff)."
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

      {/* 4. Submission Action with Font-Sans Button */}
      <button
        type="submit"
        disabled={!isFormValid || isSubmitting}
        className="w-full border-2 border-[#00E5FF] bg-[#00E5FF] py-3.5 font-sans font-bold text-xs uppercase tracking-widest text-[#0A1128] shadow-[0_0_15px_rgba(0,229,255,0.3)] transition-all hover:bg-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ borderRadius: 0 }}
      >
        {isSubmitting ? 'Sealing Cryptographic Affidavit...' : 'Submit Statutory Impact Affidavit'}
      </button>
    </form>
  );
};
