/**
 * OpenFDA Drug NDC Directory API Types & Synchronization Contracts
 * Source: https://open.fda.gov/apis/drug/ndc/
 */

export interface OpenFdaActiveIngredient {
  name: string;
  strength?: string | null;
}

export interface OpenFdaPackaging {
  package_ndc: string;
  description?: string;
  marketing_start_date?: string;
  marketing_end_date?: string;
  sample?: boolean;
}

export interface OpenFdaHarmonizedData {
  application_number?: string[];
  brand_name?: string[];
  generic_name?: string[];
  manufacturer_name?: string[];
  product_ndc?: string[];
  product_type?: string[];
  route?: string[];
  substance_name?: string[];
  rxcui?: string[];
  spl_id?: string[];
  spl_set_id?: string[];
  unii?: string[];
}

export interface OpenFdaNdcRecord {
  product_ndc: string;
  generic_name?: string | null;
  brand_name?: string | null;
  brand_name_base?: string | null;
  brand_name_suffix?: string | null;
  dosage_form?: string | null;
  route?: string[] | null;
  product_type?: string | null;
  marketing_category?: string | null;
  application_number?: string | null;
  labeler_name?: string | null;
  marketing_start_date?: string | null;
  marketing_end_date?: string | null;
  listing_expiration_date?: string | null;
  active_ingredients?: OpenFdaActiveIngredient[] | null;
  packaging?: OpenFdaPackaging[] | null;
  openfda?: OpenFdaHarmonizedData | null;
  finished?: boolean;
}

export interface OpenFdaNdcResponse {
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
  results?: OpenFdaNdcRecord[];
  error?: {
    code: string;
    message: string;
  };
}

export interface ParsedStrength {
  numeratorValue: number | null;
  numeratorUnit: string | null;
  denominatorValue: number | null;
  denominatorUnit: string | null;
  rawString: string | null;
}

export interface NormalizedIngredientItem {
  preferredName: string;
  normalizedName: string;
  rawStrength: string | null;
  strength: ParsedStrength;
}

export interface NormalizedDrugRecord {
  productNdc: string;
  genericName: string;
  brandName: string | null;
  displayName: string;
  dosageForm: string;
  route: string | null;
  marketingCategory: string | null;
  applicationNumber: string | null;
  labelerName: string | null;
  marketingStartDate: string | null;
  marketingEndDate: string | null;
  sourceUpdatedAt: string | null;
  activeIngredients: NormalizedIngredientItem[];
  payloadHash: string; // 64-character SHA-256 hex string
  sourcePayload: Record<string, unknown>;
  metadataSnapshot?: Record<string, unknown>;
  isHumanDrug: boolean;
  isValid: boolean;
  rejectionReason?: string;
}

export type SyncMode = 'api' | 'bulk_download';

export interface SyncOptions {
  mode?: SyncMode;
  bulkFilePath?: string;
  limit?: number;
  skip?: number;
  maxRecords?: number;
  batchSize?: number;
  dryRun?: boolean;
  apiKey?: string;
  baseUrl?: string;
  maxRetries?: number;
  backoffMs?: number;
  fetchImpl?: typeof fetch;
  targetProductType?: 'HUMAN_PRESCRIPTION' | 'HUMAN_OTC' | 'ALL_HUMAN';
}

export interface SyncStats {
  mode: SyncMode;
  dryRun: boolean;
  totalReceived: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  ingredientsCreated: number;
  productsCreated: number;
  productsUpdated: number;
  catalogEntriesCreated: number; // Always 0 per clinic design (catalog entries created on demand)
  rejectionReasons: Record<string, number>;
  batchesProcessed: number;
  syncRunId?: string;
  durationMs: number;
  errors: string[];
}
