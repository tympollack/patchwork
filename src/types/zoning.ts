/**
 * Statutory 500-Ft Zoning Buffer & Civic Evidentiary Dossier Engine Types
 * (SPEC-PW-ZON-01 / TASK-PW-ZON-01)
 */

export interface ZoningNode {
  id: string;
  parcel_pin: string;
  jurisdiction: string;
  geom?: any;
  status: 'active' | 'pending_audit' | 'appealed' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface BufferParcel {
  id: string;
  zoning_node_id: string;
  parcel_pin: string;
  deeded_address: string;
  geom?: any;
  calculated_distance_ft: number;
  claim_pin_hash?: string | null;
  claim_status: 'unclaimed' | 'active' | 'verified' | 'flagged';
  claimed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImpactAffidavit {
  id: string;
  buffer_parcel_id?: string | null;
  zoning_node_id: string;
  code_section: string;
  narrative_summary: string;
  evidence_s3_url: string;
  evidence_sha256: string;
  az_heading?: number | null;
  gps_precision_m?: number | null;
  filing_ref?: string | null;
  created_at: string;
}

export interface BufferClaimProgress {
  zoning_node_id: string;
  parcel_pin: string;
  jurisdiction: string;
  total_buffer_parcels: number;
  claimed_parcels: number;
  verified_parcels: number;
  affidavit_count: number;
  claim_percentage: number;
  statutory_buffer_feet: number;
}
