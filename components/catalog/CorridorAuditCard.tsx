'use client';

import React, { useState } from 'react';
import { RemediationTimeline, CommunityStance } from './RemediationTimeline';

export interface CorridorAuditItem {
  id: string;
  h3Res8: string;
  parcelId: string;
  ownerName?: string;
  latitude: number;
  longitude: number;
  timestamp: string | number;
  photoUrl: string;
  remediatedPhotoUrl?: string;
  insideSchoolBuffer: boolean;
  nearestSchoolDistM?: number | null;
  luminanceNits?: number;
  communityStance: CommunityStance;
  decreeServedAt?: string | number | null;
  remediatedAt?: string | number | null;
  ocrText?: string;
}

export interface CorridorAuditCardProps {
  item: CorridorAuditItem;
  className?: string;
}

export const CorridorAuditCard: React.FC<CorridorAuditCardProps> = ({ item, className = '' }) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0-100
  const [showTimeline, setShowTimeline] = useState<boolean>(false);

  const formattedDate = new Date(item.timestamp).toISOString().replace('T', ' ').substring(0, 19);

  const hasBeforeAfter = item.communityStance === 'Remediated' && Boolean(item.remediatedPhotoUrl);

  const getStanceBadgeStyle = (stance: CommunityStance) => {
    switch (stance) {
      case 'Remediated':
        return 'bg-emerald-500/10 border-emerald-400 text-emerald-400';
      case 'Decree Served':
        return 'bg-[#00FFFF]/10 border-[#00FFFF] text-[#00FFFF]';
      case 'Deliberating':
      default:
        return 'bg-amber-500/10 border-amber-400 text-amber-400';
    }
  };

  return (
    <article
      data-testid={`corridor-audit-card-${item.id}`}
      className={`border border-[#6495ED]/40 bg-[#0A1128] text-white p-5 rounded font-sans transition-all hover:border-[#00FFFF]/60 shadow-lg ${className}`}
      style={{ backgroundColor: '#0A1128', borderColor: '#6495ED' }}
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#6495ED]/30 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#6495ED] tracking-wider uppercase">
            CELL:
          </span>
          <span
            data-testid="card-h3-cell"
            className="font-mono text-xs font-bold text-[#00FFFF] px-1.5 py-0.5 bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded"
          >
            {item.h3Res8}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* School Buffer Badge */}
          <span
            data-testid="card-school-buffer-badge"
            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
              item.insideSchoolBuffer
                ? 'bg-red-500/10 border-red-400 text-red-400'
                : 'bg-emerald-500/10 border-emerald-400 text-emerald-400'
            }`}
          >
            {item.insideSchoolBuffer ? '⚠️ WITHIN 1,000FT SCHOOL BUFFER' : 'OUTSIDE BUFFER'}
          </span>

          {/* Stance Badge */}
          <span
            data-testid="card-community-stance-badge"
            className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${getStanceBadgeStyle(
              item.communityStance
            )}`}
          >
            {item.communityStance}
          </span>
        </div>
      </div>

      {/* Visual Section: Fixed aspect ratio container (Zero Layout Shift / CLS) */}
      <div className="relative w-full aspect-video bg-black/60 border border-[#6495ED]/30 rounded overflow-hidden mb-4 select-none">
        {hasBeforeAfter && item.remediatedPhotoUrl ? (
          /* Before / After Comparison Slider */
          <div data-testid="before-after-slider-container" className="relative w-full h-full">
            {/* After (Remediated) Image - Background */}
            <img
              src={item.remediatedPhotoUrl}
              alt="Remediated Corridor"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              width={640}
              height={360}
            />
            <div className="absolute top-2 right-2 z-10 bg-emerald-950/80 border border-emerald-400 text-emerald-300 font-mono text-[10px] px-2 py-0.5 rounded">
              REMEDIATED
            </div>

            {/* Before (Audit) Image - Clipped foreground */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={item.photoUrl}
                alt="Audit sightline"
                className="absolute inset-0 w-full h-full object-cover max-w-none"
                style={{ width: '100%', height: '100%' }}
                loading="lazy"
                width={640}
                height={360}
              />
              <div className="absolute top-2 left-2 z-10 bg-red-950/80 border border-red-400 text-red-300 font-mono text-[10px] px-2 py-0.5 rounded">
                AUDITED AD
              </div>
            </div>

            {/* Slider Divider Bar */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-[#00FFFF] shadow-[0_0_10px_#00FFFF] cursor-ew-resize z-20"
              style={{ left: `calc(${sliderPosition}% - 2px)` }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -left-2.5 w-6 h-6 rounded-full bg-[#00FFFF] text-[#0A1128] flex items-center justify-center font-bold text-[10px]">
                ⬌
              </div>
            </div>

            {/* Native range input for accessible sliding */}
            <input
              type="range"
              min={0}
              max={100}
              value={sliderPosition}
              onChange={(e) => setSliderPosition(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
              aria-label="Before and after comparison slider"
            />
          </div>
        ) : (
          /* Single Image with zero layout shift */
          <div className="relative w-full h-full">
            <img
              src={item.photoUrl}
              alt={`Audit sightline at ${item.parcelId}`}
              className="w-full h-full object-cover"
              loading="lazy"
              width={640}
              height={360}
            />
            <div className="absolute bottom-2 left-2 bg-[#0A1128]/85 border border-[#6495ED]/40 px-2 py-1 rounded font-mono text-[10px] text-gray-300">
              {item.luminanceNits ? `${item.luminanceNits} cd/m²` : 'STANDARD DAYLIGHT'}
            </div>
          </div>
        )}
      </div>

      {/* Metadata Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs mb-3 text-gray-300">
        <div className="bg-[#0A1128]/90 border border-[#6495ED]/30 p-2 rounded">
          <span className="text-[10px] text-[#6495ED] block uppercase">PARCEL PIN</span>
          <span className="text-white font-bold truncate block">{item.parcelId}</span>
        </div>

        <div className="bg-[#0A1128]/90 border border-[#6495ED]/30 p-2 rounded">
          <span className="text-[10px] text-[#6495ED] block uppercase">COORDINATES</span>
          <span className="text-[#00FFFF] block truncate">
            {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
          </span>
        </div>

        <div className="bg-[#0A1128]/90 border border-[#6495ED]/30 p-2 rounded col-span-2 sm:col-span-1">
          <span className="text-[10px] text-[#6495ED] block uppercase">RECORDED AT</span>
          <span className="text-white block truncate">{formattedDate}</span>
        </div>
      </div>

      {/* OCR Text / Operator info if present */}
      {item.ocrText && (
        <div className="bg-black/30 border border-[#6495ED]/20 p-2.5 rounded font-mono text-[11px] text-gray-300 mb-3">
          <span className="text-[9px] text-[#6495ED] block uppercase tracking-wider mb-0.5">
            OCR SIGNAGE TEXT:
          </span>
          <span className="italic">"{item.ocrText}"</span>
        </div>
      )}

      {/* Toggle Timeline Action */}
      <div className="pt-2 border-t border-[#6495ED]/30 flex items-center justify-between">
        <button
          type="button"
          data-testid="toggle-timeline-btn"
          onClick={() => setShowTimeline(!showTimeline)}
          className="text-xs font-mono text-[#00FFFF] hover:underline flex items-center gap-1"
        >
          {showTimeline ? '▲ COLLAPSE TIMELINE' : '▼ EXPAND REMEDIATION TIMELINE'}
        </button>

        {item.nearestSchoolDistM && (
          <span className="text-[10px] font-mono text-gray-400">
            PROXIMITY: {item.nearestSchoolDistM}m
          </span>
        )}
      </div>

      {/* Collapsible Timeline */}
      {showTimeline && (
        <div className="mt-3">
          <RemediationTimeline
            currentStance={item.communityStance}
            createdAt={item.timestamp}
            decreeServedAt={item.decreeServedAt}
            remediatedAt={item.remediatedAt}
          />
        </div>
      )}
    </article>
  );
};
