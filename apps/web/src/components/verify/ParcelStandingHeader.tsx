import React from 'react';
import { InstitutionalTrustBadge } from '../trust/InstitutionalTrustBadge';

export interface ParcelStandingHeaderProps {
  parcelPin: string;
  deededAddress: string;
  calculatedDistanceFt: number;
  claimStatus?: 'unclaimed' | 'active' | 'verified' | 'flagged';
}

export const ParcelStandingHeader: React.FC<ParcelStandingHeaderProps> = ({
  parcelPin,
  deededAddress,
  calculatedDistanceFt,
  claimStatus = 'unclaimed',
}) => {
  const isPending = claimStatus === 'unclaimed';
  const statusLabel = isPending ? 'Claim Pending Verification' : 'Verified Standing';
  const statusColor = isPending ? 'text-amber-400 border-amber-500/50' : 'text-[#00E5FF] border-[#00E5FF]/50';

  return (
    <div
      className="border border-[#4A90E2] bg-[#0A1128]/95 p-6 shadow-xl"
      style={{ borderRadius: 0 }}
      data-testid="parcel-standing-header"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-[#6495ED]">
              Statutory Parcel Record
            </span>
            <span
              className={`border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${statusColor}`}
              style={{ borderRadius: 0 }}
            >
              {statusLabel}
            </span>
          </div>

          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
            {deededAddress || 'Deeded Address Not Available'}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-4 font-mono text-sm text-[#7AA7E8]">
            <div>
              <span className="text-slate-400">PIN: </span>
              <span className="font-bold text-[#00E5FF]">{parcelPin}</span>
            </div>
            <div>
              <span className="text-slate-400">Buffer Offset: </span>
              <span className="font-bold text-white">{calculatedDistanceFt} ft</span>
              <span className="text-slate-500"> (&lt; 500 ft Standing Limit)</span>
            </div>
          </div>
        </div>

        <div className="self-start">
          <InstitutionalTrustBadge />
        </div>
      </div>
    </div>
  );
};
