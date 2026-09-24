/**
 * Types and interfaces for the Medication Knowledge Base and Clinic Drug Catalog.
 * Based on Prescribable RxNorm, RxTerms, and DailyMed specifications.
 */

export type DrugIngredientStatus = 'active' | 'obsolete' | 'remap';

export type DrugProductStatus = 'cached' | 'locally_added' | 'inactive' | 'obsolete';

export type DrugCatalogLifecycleStatus = 'cached' | 'frequently_used' | 'locally_added' | 'inactive';

export type DrugAliasType = 'local_brand' | 'arabic_name' | 'clinic_nickname' | 'synonym';

export type DrugSyncStatus = 'running' | 'success' | 'failed' | 'partial';

export type DrugSyncRunType = 'jit_resolve' | 'monthly_refresh' | 'manual_sync';

export interface DrugIngredient {
  id: string;
  rx_cui?: string | null;
  preferred_name: string;
  normalized_name: string;
  status: DrugIngredientStatus;
  source_system: string;
  source_identifier?: string | null;
  retrieved_at: string;
  payload_hash?: string | null;
  source_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DrugProduct {
  id: string;
  rx_cui?: string | null;
  brand_name?: string | null;
  generic_name: string;
  display_name: string;
  dosage_form: string;
  route?: string | null;
  country: string;
  is_local_product: boolean;
  status: DrugProductStatus;
  source_system: string;
  source_identifier?: string | null;
  retrieved_at: string;
  payload_hash?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  ingredients?: DrugProductIngredient[];
  labels?: DrugLabel[];
  aliases?: DrugAlias[];
  catalog_entry?: ClinicDrugCatalog | null;
}

export interface DrugProductIngredient {
  id: string;
  product_id: string;
  ingredient_id: string;
  strength_numerator_value?: number | null;
  strength_numerator_unit?: string | null;
  strength_denominator_value?: number | null;
  strength_denominator_unit?: string | null;
  display_order: number;
  created_at: string;
  // Joins
  ingredient?: DrugIngredient;
}

export interface DrugAlias {
  id: string;
  product_id?: string | null;
  ingredient_id?: string | null;
  alias_name: string;
  normalized_alias: string;
  alias_type: DrugAliasType;
  language: string;
  is_active: boolean;
  created_at: string;
}

export interface DrugLabel {
  id: string;
  product_id: string;
  dailymed_set_id: string;
  label_version?: string | null;
  label_url?: string | null;
  source_system: string;
  source_identifier?: string | null;
  retrieved_at: string;
  payload_hash?: string | null;
  published_at?: string | null;
  last_synced_at: string;
}

export interface ClinicDrugCatalog {
  id: string;
  product_id: string;
  lifecycle_status: DrugCatalogLifecycleStatus;
  usage_count: number;
  is_starred: boolean;
  is_enabled: boolean;
  clinical_notes?: string | null;
  last_prescribed_by?: string | null;
  last_prescribed_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  product?: DrugProduct;
}

export interface DrugSyncRun {
  id: string;
  run_type: DrugSyncRunType;
  source_system: string;
  started_at: string;
  completed_at?: string | null;
  status: DrugSyncStatus;
  processed_count: number;
  cached_count: number;
  updated_count: number;
  errors_count: number;
  error_log?: string | null;
}

/**
 * Interface representing drug search results returned to doctor UI
 */
export interface DrugSearchResultItem {
  source: 'local_catalog' | 'rxterms_external' | 'rxnorm_external';
  product_id?: string;
  rx_cui?: string;
  brand_name?: string | null;
  generic_name: string;
  display_name: string;
  dosage_form: string;
  route?: string | null;
  active_ingredients: {
    name: string;
    rx_cui?: string | null;
    strength_numerator_value?: number | null;
    strength_numerator_unit?: string | null;
    strength_denominator_value?: number | null;
    strength_denominator_unit?: string | null;
  }[];
  is_local_product: boolean;
  is_cached: boolean;
  is_starred?: boolean;
  usage_count?: number;
  dailymed_set_id?: string | null;
  matched_alias?: string | null;
}
