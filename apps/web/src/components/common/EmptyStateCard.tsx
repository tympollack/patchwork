import React from 'react';

export interface EmptyStateCardProps {
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyStateCard: React.FC<EmptyStateCardProps> = ({
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      role="region"
      aria-label="Empty State Notice"
      className={`border border-[#4A90E2]/60 bg-[#0A1128]/80 p-8 text-center ${className}`}
      style={{ borderRadius: 0 }}
      data-testid="empty-state-card"
    >
      <div className="font-mono text-xs uppercase tracking-widest text-[#4A90E2]">
        [ 0 Records Located ]
      </div>
      <h3 className="mt-2 text-lg font-bold text-white uppercase tracking-wider">{title}</h3>
      <p className="mt-2 text-sm text-slate-400 max-w-md mx-auto">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-6 border border-[#00E5FF] bg-transparent px-4 py-2 font-mono text-xs uppercase tracking-wider text-[#00E5FF] transition-all hover:bg-[#00E5FF]/10"
          style={{ borderRadius: 0 }}
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
