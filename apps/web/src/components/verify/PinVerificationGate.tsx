'use client';

import React, { useState } from 'react';
import { PinOtpInput } from './PinOtpInput';
import { verifyParcelClaim } from '../../actions/verifyParcel';

export interface PinVerificationGateProps {
  parcelPin: string;
  zoningNodeId?: string;
  authToken?: string;
  onSuccess?: (redirectUrl: string) => void;
}

export const PinVerificationGate: React.FC<PinVerificationGateProps> = ({
  parcelPin,
  zoningNodeId = 'swim-club-zoning-node',
  authToken,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const handlePinComplete = async (completedPin: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await verifyParcelClaim(
        parcelPin,
        completedPin,
        zoningNodeId,
        authToken
      );

      if (!result.success) {
        setErrorMessage(
          result.error ||
            'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.'
        );
        setLoading(false);
        return;
      }

      setVerifiedSuccess(true);
      if (typeof window !== 'undefined' && result.claimToken) {
        try {
          sessionStorage.setItem('active_claim_token', result.claimToken);
          sessionStorage.setItem(`claim_token_${parcelPin}`, result.claimToken);
          sessionStorage.setItem('active_parcel_pin', parcelPin);
        } catch {
          // ignore
        }
      }
      const destination = result.redirectUrl || `/audit/${zoningNodeId}`;

      if (onSuccess) {
        onSuccess(destination);
      } else if (typeof window !== 'undefined') {
        window.location.href = destination;
      }
    } catch {
      setErrorMessage(
        'Cryptographic hash mismatch. Unauthorized filing compromises evidentiary chain of custody.'
      );
      setLoading(false);
    }
  };

  return (
    <div
      className="border border-[#4A90E2] bg-[#0A1128]/90 p-8 shadow-2xl"
      style={{ borderRadius: 0 }}
      data-testid="pin-verification-gate"
    >
      <div className="mx-auto max-w-md text-center">
        <h2 className="text-xl font-bold uppercase tracking-wider text-white">
          Enter 6-Digit Direct-Mail PIN
        </h2>
        <p className="mt-2 text-sm text-[#7AA7E8]">
          Input the unique authorization PIN printed on your physical postcard notice to establish statutory filing standing.
        </p>

        <div className="mt-8">
          <PinOtpInput
            disabled={loading || verifiedSuccess}
            onComplete={handlePinComplete}
          />
        </div>

        {loading && (
          <div className="mt-6 font-mono text-sm uppercase tracking-wider text-[#00E5FF]">
            Verifying cryptographic standing ledger...
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 border border-red-500/80 bg-red-950/40 p-4 font-mono text-xs leading-relaxed text-red-200"
            style={{ borderRadius: 0 }}
          >
            <div className="font-bold uppercase tracking-wider text-red-400">
              Statutory Security Notice
            </div>
            <div className="mt-1">{errorMessage}</div>
          </div>
        )}

        {verifiedSuccess && (
          <div
            role="status"
            className="mt-6 border border-[#00E5FF] bg-cyan-950/40 p-4 font-mono text-xs uppercase tracking-wider text-[#00E5FF]"
            style={{ borderRadius: 0 }}
          >
            ✓ Standing Confirmed. Navigating to master evidentiary dossier...
          </div>
        )}

        <div className="mt-8 border-t border-[#4A90E2]/30 pt-4 text-xs text-slate-400">
          Statutory 500-Ft Buffer Registry • Municipal Code § 14-A
        </div>
      </div>
    </div>
  );
};
