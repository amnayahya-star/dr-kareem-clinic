/**
 * Types and interfaces for openFDA Drug Labeling API synchronization and clinical review.
 * Source: https://api.fda.gov/drug/label.json
 */

export type LabelReviewStatus = 'pending_review' | 'approved' | 'rejected' | 'needs_re_review';

export type LabelSyncOutcome = 
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'unmatched'
  | 'ambiguous'
  | 'rejected'
  | 'operational_error';

export interface OpenFdaLabelHarmonizedData {
  application_number?: string[];
  brand_name?: string[];
  generic_name?: string[];
  manufacturer_name?: string[];
  marketing_category?: string[];
  product_ndc?: string[];
  product_type?: string[];
  route?: string[];
  substance_name?: string[];
  rxcui?: string[];
  spl_id?: string[];
  spl_set_id?: string[];
  unii?: string[];
}

export interface OpenFdaLabelRecord {
  id?: string;
  set_id?: string;
  version?: string;
  effective_time?: string;
  dosage_and_administration?: string[] | string;
  pediatric_use?: string[] | string;
  indications_and_usage?: string[] | string;
  contraindications?: string[] | string;
  warnings_and_cautions?: string[] | string;
  warnings?: string[] | string;
  precautions?: string[] | string;
  boxed_warning?: string[] | string;
  drug_interactions?: string[] | string;
  use_in_specific_populations?: string[] | string;
  openfda?: OpenFdaLabelHarmonizedData;
  [key: string]: unknown;
}

export interface OpenFdaLabelResponse {
  meta?: {
    disclaimer?: string;
    terms?: string;
    license?: string;
    last_updated?: string;
    results?: {
      skip: number;
      limit: number;
      total: number;
    };
  };
  results?: OpenFdaLabelRecord[];
  error?: {
    code: string;
    message: string;
  };
}

export interface NormalizedDrugLabel {
  productId: string;
  sourceSystem: string;
  sourceIdentifier: string | null;
  splSetId: string | null;
  splId: string | null;
  labelVersion: string | null;
  effectiveTime: string | null;
  applicationNumber: string | null;
  marketingCategory: string | null;
  labelUrl: string | null;
  dosageAndAdministration: string | null;
  pediatricUse: string | null;
  indicationsAndUsage: string | null;
  contraindications: string | null;
  warningsAndCautions: string | null;
  boxedWarning: string | null;
  drugInteractions: string | null;
  useInSpecificPopulations: string | null;
  sourcePayload: Record<string, unknown>;
  payloadHash: string; // 64-character SHA-256
  reviewStatus: LabelReviewStatus;
}

export interface LabelSyncResult {
  productId: string;
  sourceIdentifier?: string | null;
  outcome: LabelSyncOutcome;
  labelId?: string;
  reviewStatus?: LabelReviewStatus;
  rejectionReason?: string;
  error?: string;
}

export interface LabelSyncSummary {
  received: number;
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  ambiguous: number;
  rejected: number;
  operationalErrors: number;
  results: LabelSyncResult[];
  durationMs: number;
}
