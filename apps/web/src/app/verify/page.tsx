import React from 'react';
import { ParcelStandingHeader } from '../../components/verify/ParcelStandingHeader';
import { PinVerificationGate } from '../../components/verify/PinVerificationGate';
import { EmptyStateCard } from '../../components/common/EmptyStateCard';
import { supabase } from '../../../../../src/lib/supabase';

interface VerifyPageProps {
  searchParams?: Promise<{
    p?: string;
    t?: string;
  }> | {
    p?: string;
    t?: string;
  };
}

export default async function VerifyPage(props: VerifyPageProps) {
  const resolvedParams = props.searchParams
    ? await Promise.resolve(props.searchParams)
    : {};
  const parcelPin = resolvedParams.p;
  const authToken = resolvedParams.t;

  if (!parcelPin) {
    return (
      <main className="min-h-screen bg-[#0B132B] px-4 py-16 text-slate-100 flex items-center justify-center">
        <EmptyStateCard
          title="Direct-Mail Notice Required"
          description="No statutory parcel PIN detected in filing query. Please scan the QR code printed on your official direct-mail postcard or provide parameter p={PARCEL_PIN}."
        />
      </main>
    );
  }

  // PostGIS / Supabase lookup with error guarding
  const { data: parcel, error } = await supabase
    .schema('patchwork')
    .from('buffer_parcels')
    .select('id, zoning_node_id, parcel_pin, deeded_address, calculated_distance_ft, claim_status')
    .eq('parcel_pin', parcelPin)
    .maybeSingle();

  if (error || !parcel) {
    return (
      <main className="min-h-screen bg-[#0B132B] px-4 py-16 text-slate-100 flex items-center justify-center">
        <EmptyStateCard
          title="Parcel Not Found in 500-Ft Buffer"
          description={`Parcel PIN "${parcelPin}" is not currently registered within the statutory 500-foot buffer zone or may belong to another municipal district.`}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B132B] px-4 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <ParcelStandingHeader
          parcelPin={parcel.parcel_pin}
          deededAddress={parcel.deeded_address}
          calculatedDistanceFt={Number(parcel.calculated_distance_ft) || 0}
          claimStatus={parcel.claim_status}
        />

        <PinVerificationGate
          parcelPin={parcel.parcel_pin}
          zoningNodeId={parcel.zoning_node_id}
          authToken={authToken}
        />
      </div>
    </main>
  );
}
