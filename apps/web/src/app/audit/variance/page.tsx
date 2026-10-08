import React from 'react';
import { VarianceAuditForm } from '../../../components/audit/VarianceAuditForm';
import { supabase } from '../../../../../../src/lib/supabase';

interface VariancePageProps {
  searchParams?: Promise<{
    parcel_pin?: string;
    node_id?: string;
    buffer_parcel_id?: string;
  }> | {
    parcel_pin?: string;
    node_id?: string;
    buffer_parcel_id?: string;
  };
}

export default async function VarianceAuditPage(props: VariancePageProps) {
  const resolvedSearch = props.searchParams ? await Promise.resolve(props.searchParams) : {};
  const { parcel_pin, node_id, buffer_parcel_id } = resolvedSearch;

  // Attempt to resolve context if node_id is provided
  let jurisdiction = 'Hamilton County BZA';
  if (node_id) {
    const { data: node } = await supabase
      .schema('patchwork')
      .from('zoning_nodes')
      .select('jurisdiction, parcel_pin')
      .eq('id', node_id)
      .maybeSingle();

    if (node) {
      jurisdiction = node.jurisdiction;
    }
  }

  return (
    <main className="min-h-screen bg-[#0B132B] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-8">
        <div
          className="border border-[#4A90E2] bg-[#0A1128]/90 p-5 shadow-lg"
          style={{ borderRadius: 0 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-[#6495ED]">
                Docket Case: {jurisdiction}
              </span>
              <h1 className="text-xl font-bold text-white mt-1">
                Topographic Variance & Setback Field Audit
              </h1>
            </div>
            {parcel_pin && (
              <div
                className="font-mono text-xs text-[#00E5FF] border border-[#00E5FF]/40 px-2.5 py-1 self-start sm:self-auto bg-[#00E5FF]/5"
                style={{ borderRadius: 0 }}
              >
                TARGET PIN: {parcel_pin}
              </div>
            )}
          </div>
        </div>

        <VarianceAuditForm
          initialParcelPin={parcel_pin || ''}
          zoningNodeId={node_id}
          bufferParcelId={buffer_parcel_id}
        />
      </div>
    </main>
  );
}
