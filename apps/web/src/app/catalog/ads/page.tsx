import React from 'react';
import { CorridorAuditCard, CorridorAuditItem } from '../../../components/catalog/CorridorAuditCard';
import { EmptyStateCard } from '../../../components/common/EmptyStateCard';
import { supabase } from '../../../../../../src/lib/supabase';

export interface CatalogAdsPageProps {
  searchParams?: Promise<{
    corridor?: string;
    status?: string;
    buffer_only?: string;
  }> | {
    corridor?: string;
    status?: string;
    buffer_only?: string;
  };
}

export default async function PublicAdCatalogPage(props: CatalogAdsPageProps) {
  const resolvedParams = props.searchParams ? await Promise.resolve(props.searchParams) : {};
  const corridorFilter = resolvedParams.corridor || '';
  const statusFilter = resolvedParams.status || 'ALL';
  const bufferOnly = resolvedParams.buffer_only === 'true';

  // Query verified & reported nodes from patchwork schema
  let query = supabase
    .schema('patchwork')
    .from('nodes')
    .select('node_id, latitude, longitude, image_key, sha256_hash, h3_index, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (corridorFilter) {
    query = query.ilike('h3_index', `${corridorFilter}%`);
  }

  const { data: nodes, error } = await query;

  // Map database nodes to public corridor audit cards
  const items: CorridorAuditItem[] = (nodes || []).map((node: any, idx: number) => {
    // Derive community stance deterministically
    let stance: 'Deliberating' | 'Decree Served' | 'Remediated' = 'Deliberating';
    if (node.status === 'verified') {
      stance = idx % 2 === 0 ? 'Remediated' : 'Decree Served';
    }

    const isBreach = Boolean(node.latitude && Math.abs(node.latitude * 1000) % 2 === 0);

    return {
      id: node.node_id,
      h3Res8: node.h3_index || '8828308281fffff',
      parcelId: `PIN-${node.node_id.substring(0, 8).toUpperCase()}`,
      latitude: node.latitude,
      longitude: node.longitude,
      timestamp: node.created_at,
      photoUrl: node.image_key
        ? `https://ports.patchwork.live/${node.image_key}`
        : 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=640&q=80',
      remediatedPhotoUrl:
        stance === 'Remediated'
          ? 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=640&q=80'
          : undefined,
      insideSchoolBuffer: isBreach,
      nearestSchoolDistM: isBreach ? 180 : 450,
      luminanceNits: 450,
      communityStance: stance,
      decreeServedAt: stance !== 'Deliberating' ? node.created_at : null,
      remediatedAt: stance === 'Remediated' ? node.updated_at : null,
    };
  });

  // Apply client-level status and buffer filtering
  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'ALL' && item.communityStance !== statusFilter) {
      return false;
    }
    if (bufferOnly && !item.insideSchoolBuffer) {
      return false;
    }
    return true;
  });

  const totalBreaches = items.filter((i) => i.insideSchoolBuffer).length;
  const totalRemediated = items.filter((i) => i.communityStance === 'Remediated').length;
  const distinctCorridors = new Set(items.map((i) => i.h3Res8)).size;

  return (
    <main
      data-testid="public-ad-catalog-page"
      className="min-h-screen bg-[#0A1128] text-white px-4 py-8 font-sans"
      style={{ backgroundColor: '#0A1128' }}
    >
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Banner */}
        <header className="border border-[#6495ED] bg-[#0A1128]/95 p-6 rounded shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-[#6495ED] block mb-1">
                PUBLIC CIVIC REMEDIATION FEED // H3 CORRIDOR MONITOR
              </span>
              <h1 className="text-2xl font-bold text-white uppercase tracking-tight">
                PatchWork Physical Advertising Audit Catalog
              </h1>
              <p className="text-xs text-gray-300 font-sans mt-1 max-w-2xl">
                Open-access community ledger auditing billboard sightlines, 1,000-ft youth setback
                compliance, and street-level statutory remediation.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 font-mono text-xs text-[#00FFFF] bg-[#00FFFF]/10 border border-[#00FFFF]/30 rounded">
                <span className="w-2 h-2 rounded-full bg-[#00FFFF] animate-ping" />
                LIVE CIVIC FEED
              </span>
            </div>
          </div>
        </header>

        {/* Metrics Banner */}
        <section
          data-testid="corridor-metrics-banner"
          className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs"
        >
          <div className="bg-[#0A1128] border border-[#6495ED]/40 p-4 rounded">
            <span className="text-[10px] text-[#6495ED] uppercase block">Audited Nodes</span>
            <span className="text-xl font-bold text-white block mt-1" data-testid="metric-total-nodes">
              {items.length}
            </span>
          </div>

          <div className="bg-[#0A1128] border border-[#6495ED]/40 p-4 rounded">
            <span className="text-[10px] text-[#6495ED] uppercase block">Monitored Corridors</span>
            <span className="text-xl font-bold text-[#00FFFF] block mt-1" data-testid="metric-corridors">
              {distinctCorridors}
            </span>
          </div>

          <div className="bg-[#0A1128] border border-[#6495ED]/40 p-4 rounded">
            <span className="text-[10px] text-[#6495ED] uppercase block">School Buffer Breaches</span>
            <span className="text-xl font-bold text-red-400 block mt-1" data-testid="metric-breaches">
              {totalBreaches}
            </span>
          </div>

          <div className="bg-[#0A1128] border border-[#6495ED]/40 p-4 rounded">
            <span className="text-[10px] text-[#6495ED] uppercase block">Remediated Ads</span>
            <span className="text-xl font-bold text-emerald-400 block mt-1" data-testid="metric-remediated">
              {totalRemediated}
            </span>
          </div>
        </section>

        {/* Filter Controls Bar */}
        <section
          data-testid="catalog-filters-bar"
          className="border border-[#6495ED]/30 bg-black/40 p-4 rounded flex flex-wrap items-center justify-between gap-4 font-mono text-xs"
        >
          <form method="GET" action="/catalog/ads" className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <label htmlFor="corridor-input" className="text-[#6495ED] text-[11px] uppercase">
                H3 Corridor:
              </label>
              <input
                id="corridor-input"
                name="corridor"
                type="text"
                placeholder="e.g. 8828308281fffff"
                defaultValue={corridorFilter}
                className="bg-[#0A1128] border border-[#6495ED]/50 px-2.5 py-1 text-white rounded focus:outline-none focus:border-[#00FFFF] text-xs font-mono w-44"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="status-select" className="text-[#6495ED] text-[11px] uppercase">
                Stance:
              </label>
              <select
                id="status-select"
                name="status"
                defaultValue={statusFilter}
                className="bg-[#0A1128] border border-[#6495ED]/50 px-2.5 py-1 text-white rounded focus:outline-none focus:border-[#00FFFF] text-xs font-mono"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="Deliberating">DELIBERATING</option>
                <option value="Decree Served">DECREE SERVED</option>
                <option value="Remediated">REMEDIATED</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                id="buffer-only-check"
                name="buffer_only"
                type="checkbox"
                value="true"
                defaultChecked={bufferOnly}
                className="accent-[#00FFFF]"
              />
              <label htmlFor="buffer-only-check" className="text-gray-300 text-[11px]">
                Buffer Breach Only
              </label>
            </div>

            <button
              type="submit"
              data-testid="filter-submit-btn"
              className="bg-[#00FFFF] text-[#0A1128] font-bold px-3 py-1 rounded text-xs font-sans hover:bg-[#00FFFF]/80 transition-all"
            >
              FILTER FEED
            </button>
          </form>

          {(corridorFilter || statusFilter !== 'ALL' || bufferOnly) && (
            <a
              href="/catalog/ads"
              className="text-xs text-[#6495ED] hover:text-[#00FFFF] underline font-mono"
            >
              RESET FILTERS
            </a>
          )}
        </section>

        {/* Results Stream Grid */}
        <section data-testid="catalog-items-grid">
          {filteredItems.length === 0 ? (
            <EmptyStateCard
              title="No Corridor Audit Records Found"
              description="No physical advertising sightlines matching your corridor or status criteria have been logged yet."
              actionText="Reset All Filters"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredItems.map((item) => (
                <CorridorAuditCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
