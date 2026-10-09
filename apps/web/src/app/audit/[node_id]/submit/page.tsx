import React from 'react';
import { AffidavitDiagnosticForm } from '../../../../components/affidavit/AffidavitDiagnosticForm';
import { EmptyStateCard } from '../../../../components/common/EmptyStateCard';
import { supabase } from '../../../../../../../src/lib/supabase';

interface SubmitPageProps {
  params: Promise<{ node_id: string }> | { node_id: string };
  searchParams?: Promise<{ parcel_pin?: string; buffer_parcel_id?: string }> | {
    parcel_pin?: string;
    buffer_parcel_id?: string;
  };
}

export default async function SubmitAffidavitPage(props: SubmitPageProps) {
  const resolvedParams = await Promise.resolve(props.params);
  const resolvedSearch = props.searchParams ? await Promise.resolve(props.searchParams) : {};
  const nodeId = resolvedParams.node_id;

  if (!nodeId) {
    return (
      <main className="min-h-screen bg-[#0B132B] px-4 py-16 text-slate-100 flex items-center justify-center">
        <EmptyStateCard
          title="Zoning Docket Not Specified"
          description="Target zoning node ID missing from route path. Please select an active zoning review node to file an impact affidavit."
        />
      </main>
    );
  }

  // Fetch node with error guard
  const { data: node, error } = await supabase
    .schema('patchwork')
    .from('zoning_nodes')
    .select('id, parcel_pin, jurisdiction, status')
    .eq('id', nodeId)
    .maybeSingle();

  if (error || !node) {
    return (
      <main className="min-h-screen bg-[#0B132B] px-4 py-16 text-slate-100 flex items-center justify-center">
        <EmptyStateCard
          title="Zoning Review Docket Not Found"
          description={`Zoning node "${nodeId}" was not found in the active 500-foot buffer registry or may be archived.`}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B132B] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="border border-[#4A90E2] bg-[#0A1128]/90 p-5 shadow-lg" style={{ borderRadius: 0 }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-[#6495ED]">
                Docket Case: {node.jurisdiction}
              </span>
              <h1 className="text-xl font-bold text-white mt-1">
                Target PIN: <span className="font-mono text-[#00E5FF]">{node.parcel_pin}</span>
              </h1>
            </div>
            <div className="font-mono text-xs text-amber-400 border border-amber-500/40 px-2.5 py-1 self-start sm:self-auto" style={{ borderRadius: 0 }}>
              STATUS: {node.status.toUpperCase()}
            </div>
          </div>
        </div>

        <AffidavitDiagnosticForm
          zoningNodeId={node.id}
          parcelPin={resolvedSearch.parcel_pin}
          bufferParcelId={resolvedSearch.buffer_parcel_id}
        />
      </div>
    </main>
  );
}
