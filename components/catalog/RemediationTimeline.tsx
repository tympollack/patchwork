'use client';

import React from 'react';

export type CommunityStance = 'Deliberating' | 'Decree Served' | 'Remediated';

export interface TimelineEvent {
  stage: CommunityStance;
  label: string;
  timestamp?: string | number | null;
  description: string;
  completed: boolean;
  active?: boolean;
}

export interface RemediationTimelineProps {
  currentStance: CommunityStance;
  createdAt: string | number;
  decreeServedAt?: string | number | null;
  remediatedAt?: string | number | null;
  className?: string;
}

export const RemediationTimeline: React.FC<RemediationTimelineProps> = ({
  currentStance,
  createdAt,
  decreeServedAt,
  remediatedAt,
  className = '',
}) => {
  const formatDate = (val?: string | number | null) => {
    if (!val) return 'PENDING';
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
  };

  const steps: TimelineEvent[] = [
    {
      stage: 'Deliberating',
      label: 'COMMUNITY AUDIT & DELIBERATION',
      timestamp: createdAt,
      description: 'Attested sightline recorded. Corridor impact undergoing peer consensus.',
      completed: true,
      active: currentStance === 'Deliberating',
    },
    {
      stage: 'Decree Served',
      label: 'FORMAL NOTICE / DECREE SERVED',
      timestamp: decreeServedAt,
      description: 'Zoning & school buffer compliance notice transmitted to parcel operator.',
      completed: currentStance === 'Decree Served' || currentStance === 'Remediated',
      active: currentStance === 'Decree Served',
    },
    {
      stage: 'Remediated',
      label: 'COMPLIANCE REMEDIATION CONFIRMED',
      timestamp: remediatedAt,
      description: 'Physical ad removed or brought into full statutory illumination compliance.',
      completed: currentStance === 'Remediated',
      active: currentStance === 'Remediated',
    },
  ];

  return (
    <div
      data-testid="remediation-timeline"
      className={`border border-[#6495ED]/30 bg-[#0A1128]/70 p-4 font-mono text-xs ${className}`}
    >
      <div className="text-[10px] uppercase text-[#6495ED] tracking-wider mb-3">
        CORRIDOR REMEDIATION PROTOCOL // STATUS TIMELINE
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#6495ED]/20">
        {steps.map((step, idx) => {
          let nodeColor = 'bg-gray-700 border-gray-600 text-gray-400';
          if (step.completed) {
            nodeColor = 'bg-[#00FFFF] border-[#00FFFF] text-[#0A1128]';
          }
          if (step.active) {
            nodeColor = 'bg-[#00FFFF] border-[#00FFFF] animate-pulse text-[#0A1128]';
          }

          return (
            <div key={idx} className="relative group">
              {/* Timeline marker */}
              <div
                className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold ${nodeColor}`}
              >
                {step.completed ? '✓' : idx + 1}
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span
                    className={`font-bold tracking-tight uppercase ${
                      step.completed || step.active ? 'text-white' : 'text-gray-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className="text-[10px] text-[#6495ED]">
                    [{formatDate(step.timestamp)}]
                  </span>
                </div>
                <p className="text-[11px] text-gray-300 font-sans mt-0.5 leading-snug">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
