import React from 'react';
import { HTN_TRUST_STRING } from '../../styles/tokens';

export interface InstitutionalTrustBadgeProps {
  className?: string;
}

export const InstitutionalTrustBadge: React.FC<InstitutionalTrustBadgeProps> = ({
  className = '',
}) => {
  return (
    <div
      role="status"
      aria-label="HTN Institutional Trust Compliance Badge"
      className={`inline-flex items-center gap-2 border border-[#4A90E2] bg-[#0A1128]/90 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[#4A90E2] ${className}`}
      style={{ borderRadius: 0 }}
    >
      <span>{HTN_TRUST_STRING}</span>
    </div>
  );
};
