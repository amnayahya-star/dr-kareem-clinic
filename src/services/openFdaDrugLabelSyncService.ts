/**
 * Server-only OpenFDA Drug Label Synchronization Service
 * 
 * Fetches official FDA Drug Labeling text and SPL metadata from openFDA Drug Labeling API:
 * https://api.fda.gov/drug/label.json
 * 
 * Architectural & Safety Guarantees:
 * - Server-only execution: strictly forbidden in client components.
 * - Deterministic Matching Hierarchy:
 *     1. Exact spl_set_id match (if available in target product)
 *     2. Exact product_ndc match in openfda.product_ndc
 *     3. Exact application_number match (only when clearly unique)
 * - Strictly prohibits:
 *     * Approximate/fuzzy name matching
 *     * Matching solely by brand_name or generic_name
 *     * Random first-result selection
 *     * Merging labels across different products
 * - Ambiguity handling:
 *     * Conflicting candidate labels -> marked 'ambiguous', ZERO database writes.
 *     * Multiple versions of the same label -> deterministic latest effective_time selection.
 *     * No deterministic match -> marked 'unmatched', ZERO database writes.
 * - Idempotency & SHA-256 Stability:
 *     * Produces 'created', 'updated', or 'unchanged'.
 *     * If payload_hash is identical, skips unnecessary text writes.
 * - Non-Destructive Data Merge:
 *     * Never overwrites existing valid clinical text with null or empty text.
 *     * Raw record preserved in source_payload.
 * - Clinical Review Preservation:
 *     * Starts at 'pending_review' with reviewed_by/reviewed_at NULL.
 *     * Never auto-approves.
 *     * When an approved label receives modified text upstream, transitions safely to
 *       'needs_re_review' while archiving previous review metadata.
 * - Zero database writes in dry-run mode.
 * - Zero modification of drug_products, clinic_drug_catalog, prescriptions, or patients.
 */

import { createHash } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { canonicalJsonStringify } from './openFdaDrugSyncService';
import {
  OpenFdaLabelRecord,
  OpenFdaLabelResponse,
  NormalizedDrugLabel,
  LabelSyncResult,
  LabelSyncSummary,
  LabelSyncOutcome,
} from '../types/openfdaLabel';

// Server-only runtime guard: prevents execution in client browser bundles
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  throw new Error('openFdaDrugLabelSyncService is server-only and cannot be executed in the browser.');
}

export const OPENFDA_LABEL_DEFAULT_BASE_URL = 'https://api.fda.gov/drug/label.json';
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
export const MAX_RETRY_ATTEMPTS = 2;

export interface TargetProductForSync {
  id: string;
  source_identifier: string | null; // product_ndc
  application_number: string | null;
  source_payload?: Record<string, unknown> | null;
  brand_name?: string | null;
  generic_name?: string | null;
}

export interface LabelSyncServiceOptions {
  dryRun?: boolean;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Sanitizes URLs for safe logging, masking sensitive API keys.
 */
export function sanitizeUrlForLogging(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('api_key')) {
      parsed.searchParams.set('api_key', '***REDACTED***');
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/api_key=[^&]+/g, 'api_key=***REDACTED***');
  }
}

/**
 * Formats multi-paragraph openFDA sections into unified text,
 * preserving exact paragraphs, order, and whitespace.
 */
export function normalizeLabelSection(section: string[] | string | undefined | null): string | null {
  if (!section) return null;
  if (Array.isArray(section)) {
    const cleaned = section
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return cleaned.length > 0 ? cleaned.join('\n\n') : null;
  }
  if (typeof section === 'string') {
    const trimmed = section.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/**
 * Calculates deterministic SHA-256 hash of canonical label content.
 */
export function computeLabelPayloadHash(canonicalContent: Record<string, unknown>): string {
  const canonicalString = canonicalJsonStringify(canonicalContent);
  return createHash('sha256').update(canonicalString).digest('hex');
}

/**
 * Fetches label page from openFDA with strict timeout and limited retry backoff.
 * Retries ONLY on 429 and 5xx; never on 400 or 404.
 */
export async function fetchOpenFdaLabelQuery(
  queryString: string,
  options: LabelSyncServiceOptions = {}
): Promise<OpenFdaLabelResponse | null> {
  const baseUrl = options.baseUrl || OPENFDA_LABEL_DEFAULT_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_RETRY_ATTEMPTS;
  const fetchFn = options.fetchImpl || fetch;
  const apiKey = options.apiKey || process.env.OPENFDA_API_KEY;

  const urlObj = new URL(baseUrl);
  urlObj.searchParams.set('search', queryString);
  urlObj.searchParams.set('limit', '10');
  if (apiKey) {
    urlObj.searchParams.set('api_key', apiKey);
  }

  const safeUrl = sanitizeUrlForLogging(urlObj.toString());
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchFn(urlObj.toString(), {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'DrKareemClinic-PediatricDosing-SafetyEngine/1.0',
        },
      });

      clearTimeout(timeoutId);

      // 404: Not found in openFDA
      if (response.status === 404) {
        return null;
      }

      // Permanent 4xx client errors (e.g. 400 bad query syntax) - DO NOT RETRY
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return null;
      }

      // Transient 429 (rate-limit) or 5xx (server error) - RETRY with exponential backoff
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const backoff = 500 * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
        throw new Error(`openFDA API error status ${response.status} after ${maxRetries} retries`);
      }

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('Malformed JSON received from openFDA Drug Labeling API');
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON structure received from openFDA Drug Labeling API');
      }

      return parsed as OpenFdaLabelResponse;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = (err as Error)?.name === 'AbortError';
      const errMsg = isAbort ? `Request timeout after ${timeoutMs}ms` : (err as Error)?.message || 'Network error';

      lastError = new Error(`Failed to fetch openFDA query [${safeUrl}]: ${errMsg}`);

      if (attempt < maxRetries && !isAbort) {
        const backoff = 500 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      throw lastError;
    }
  }

  return null;
}

/**
 * Deterministically resolves the best matching label record for a target product.
 * 
 * Rules:
 * 1. Checks matching criteria hierarchy (spl_set_id -> product_ndc -> application_number).
 * 2. Rejects approximate/name-based matching completely.
 * 3. If multiple candidates have conflicting set_ids -> 'ambiguous'.
 * 4. If multiple candidates share the same set_id -> deterministically selects latest effective_time.
 */
export function resolveDeterministicLabelMatch(
  product: TargetProductForSync,
  candidates: OpenFdaLabelRecord[]
): {
  outcome: 'matched' | 'unmatched' | 'ambiguous' | 'rejected';
  matchedLabel?: OpenFdaLabelRecord;
  reason?: string;
} {
  if (!candidates || candidates.length === 0) {
    return { outcome: 'unmatched', reason: 'No label candidates found in openFDA' };
  }

  // Extract identifiers from target product
  const targetNdc = product.source_identifier?.trim() || null;
  const targetAppNum = product.application_number?.trim() || null;
  
  // Check if target product has known spl_set_id in its source_payload
  let targetSplSetId: string | null = null;
  const payload = product.source_payload as Record<string, unknown> | undefined;
  if (payload && typeof payload === 'object') {
    const openfdaBlock = payload.openfda as Record<string, unknown> | undefined;
    if (openfdaBlock && Array.isArray(openfdaBlock.spl_set_id) && openfdaBlock.spl_set_id.length > 0) {
      targetSplSetId = String(openfdaBlock.spl_set_id[0]).trim();
    }
  }

  // Filter candidates that strictly and deterministically match our target product
  const filteredCandidates = candidates.filter((candidate) => {
    const candSetId = candidate.set_id?.trim() || candidate.openfda?.spl_set_id?.[0]?.trim() || null;
    const candNdcs = candidate.openfda?.product_ndc || [];
    const candAppNums = candidate.openfda?.application_number || [];

    // Priority 1: Match by spl_set_id
    if (targetSplSetId && candSetId && candSetId.toLowerCase() === targetSplSetId.toLowerCase()) {
      return true;
    }

    // Priority 2: Match by exact product_ndc
    if (targetNdc && candNdcs.includes(targetNdc)) {
      return true;
    }

    // Priority 3: Match by exact application_number
    if (targetAppNum && candAppNums.includes(targetAppNum)) {
      return true;
    }

    return false;
  });

  if (filteredCandidates.length === 0) {
    return {
      outcome: 'unmatched',
      reason: 'Candidates returned by query did not satisfy exact deterministic identifier matching',
    };
  }

  // Check set_id consistency among matched candidates
  const uniqueSetIds = new Set(
    filteredCandidates
      .map((c) => c.set_id?.trim() || c.openfda?.spl_set_id?.[0]?.trim())
      .filter((id): id is string => Boolean(id))
  );

  // If matched candidates have multiple conflicting set_ids -> Ambiguous (Do NOT guess!)
  if (uniqueSetIds.size > 1) {
    return {
      outcome: 'ambiguous',
      reason: `Found ${uniqueSetIds.size} conflicting label set_ids for target product (${Array.from(uniqueSetIds).join(', ')})`,
    };
  }

  // If multiple candidates share the same set_id, deterministically pick the latest effective_time
  const sorted = [...filteredCandidates].sort((a, b) => {
    const timeA = a.effective_time?.trim() || '00000000';
    const timeB = b.effective_time?.trim() || '00000000';
    if (timeA !== timeB) {
      return timeB.localeCompare(timeA); // Descending (latest first)
    }
    const verA = parseInt(a.version?.trim() || '0', 10);
    const verB = parseInt(b.version?.trim() || '0', 10);
    return verB - verA; // Descending version
  });

  return {
    outcome: 'matched',
    matchedLabel: sorted[0],
  };
}

/**
 * Normalizes a matched openFDA label record into the internal schema representation.
 */
export function normalizeOpenFdaLabelRecord(
  productId: string,
  rawLabel: OpenFdaLabelRecord
): NormalizedDrugLabel {
  const splSetId = rawLabel.set_id?.trim() || rawLabel.openfda?.spl_set_id?.[0]?.trim() || null;
  const splId = rawLabel.id?.trim() || rawLabel.openfda?.spl_id?.[0]?.trim() || null;
  const labelVersion = rawLabel.version?.trim() || null;
  const effectiveTime = rawLabel.effective_time?.trim() || null;
  const applicationNumber = rawLabel.openfda?.application_number?.[0]?.trim() || null;
  const marketingCategory = rawLabel.openfda?.marketing_category?.[0]?.trim() || null;
  const sourceIdentifier = rawLabel.openfda?.product_ndc?.[0]?.trim() || splSetId || null;

  const dosageAndAdministration = normalizeLabelSection(rawLabel.dosage_and_administration);
  const pediatricUse = normalizeLabelSection(rawLabel.pediatric_use);
  const indicationsAndUsage = normalizeLabelSection(rawLabel.indications_and_usage);
  const contraindications = normalizeLabelSection(rawLabel.contraindications);
  const warningsAndCautions = normalizeLabelSection(
    rawLabel.warnings_and_cautions || rawLabel.warnings || rawLabel.precautions
  );
  const boxedWarning = normalizeLabelSection(rawLabel.boxed_warning);
  const drugInteractions = normalizeLabelSection(rawLabel.drug_interactions);
  const useInSpecificPopulations = normalizeLabelSection(rawLabel.use_in_specific_populations);

  // Canonical payload for hash computation
  const canonicalPayload = {
    product_id: productId,
    spl_set_id: splSetId,
    spl_id: splId,
    label_version: labelVersion,
    effective_time: effectiveTime,
    application_number: applicationNumber,
    marketing_category: marketingCategory,
    dosage_and_administration: dosageAndAdministration,
    pediatric_use: pediatricUse,
    indications_and_usage: indicationsAndUsage,
    contraindications: contraindications,
    warnings_and_cautions: warningsAndCautions,
    boxed_warning: boxedWarning,
    drug_interactions: drugInteractions,
    use_in_specific_populations: useInSpecificPopulations,
  };

  const payloadHash = computeLabelPayloadHash(canonicalPayload);

  return {
    productId,
    sourceSystem: 'OPENFDA_LABEL',
    sourceIdentifier,
    splSetId,
    splId,
    labelVersion,
    effectiveTime,
    applicationNumber,
    marketingCategory,
    labelUrl: splSetId ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${splSetId}` : null,
    dosageAndAdministration,
    pediatricUse,
    indicationsAndUsage,
    contraindications,
    warningsAndCautions,
    boxedWarning,
    drugInteractions,
    useInSpecificPopulations,
    sourcePayload: rawLabel as Record<string, unknown>,
    payloadHash,
    reviewStatus: 'pending_review',
  };
}

/**
 * Synchronizes an openFDA label for a single target product.
 */
export async function syncDrugLabelForProduct(
  product: TargetProductForSync,
  supabase: SupabaseClient | null,
  options: LabelSyncServiceOptions = {}
): Promise<LabelSyncResult> {
  const dryRun = options.dryRun ?? true;

  // Determine query strategy
  let query: string | null = null;
  const payload = product.source_payload as Record<string, unknown> | undefined;
  const splSetId = (payload?.openfda as Record<string, unknown> | undefined)?.spl_set_id;
  
  if (Array.isArray(splSetId) && splSetId.length > 0 && typeof splSetId[0] === 'string') {
    query = `openfda.spl_set_id:"${splSetId[0]}"`;
  } else if (product.source_identifier) {
    query = `openfda.product_ndc.exact:"${product.source_identifier}"`;
  } else if (product.application_number) {
    query = `openfda.application_number.exact:"${product.application_number}"`;
  }

  if (!query) {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'unmatched',
      rejectionReason: 'Product has no valid NDC, SPL Set ID, or Application Number for deterministic query',
    };
  }

  let response: OpenFdaLabelResponse | null;
  try {
    response = await fetchOpenFdaLabelQuery(query, options);
  } catch (err: unknown) {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'operational_error',
      error: (err as Error)?.message || 'Failed openFDA label request',
    };
  }

  const resolution = resolveDeterministicLabelMatch(product, response?.results || []);

  if (resolution.outcome === 'unmatched') {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'unmatched',
      rejectionReason: resolution.reason,
    };
  }

  if (resolution.outcome === 'ambiguous') {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'ambiguous',
      rejectionReason: resolution.reason,
    };
  }

  if (!resolution.matchedLabel) {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'unmatched',
      rejectionReason: 'No matched label returned after resolution',
    };
  }

  const normalized = normalizeOpenFdaLabelRecord(product.id, resolution.matchedLabel);

  // Projected outcome inspection (Read-only)
  let projectedOutcome: LabelSyncOutcome = 'created';
  if (supabase) {
    try {
      const { data: existingData } = await supabase
        .from('drug_labels')
        .select('id, payload_hash, review_status')
        .eq('product_id', product.id)
        .eq('source_system', normalized.sourceSystem)
        .maybeSingle();

      if (existingData) {
        if (existingData.payload_hash && existingData.payload_hash === normalized.payloadHash) {
          projectedOutcome = 'unchanged';
        } else {
          projectedOutcome = 'updated';
        }
      }
    } catch {
      // In dry-run, ignore read inspection error
    }
  }

  // In DRY-RUN mode: ZERO database writes!
  if (dryRun || !supabase) {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: projectedOutcome,
      reviewStatus: normalized.reviewStatus,
    };
  }

  // Live database write via atomic RPC: upsert_openfda_drug_label
  const rpcPayload = {
    product_id: normalized.productId,
    source_system: normalized.sourceSystem,
    source_identifier: normalized.sourceIdentifier,
    spl_set_id: normalized.splSetId,
    spl_id: normalized.splId,
    label_version: normalized.labelVersion,
    effective_time: normalized.effectiveTime,
    application_number: normalized.applicationNumber,
    marketing_category: normalized.marketingCategory,
    label_url: normalized.labelUrl,
    dosage_and_administration: normalized.dosageAndAdministration,
    pediatric_use: normalized.pediatricUse,
    indications_and_usage: normalized.indicationsAndUsage,
    contraindications: normalized.contraindications,
    warnings_and_cautions: normalized.warningsAndCautions,
    boxed_warning: normalized.boxedWarning,
    drug_interactions: normalized.drugInteractions,
    use_in_specific_populations: normalized.useInSpecificPopulations,
    source_payload: normalized.sourcePayload,
    payload_hash: normalized.payloadHash,
  };

  const { data, error } = await supabase.rpc('upsert_openfda_drug_label', {
    p_label: rpcPayload,
  });

  if (error) {
    return {
      productId: product.id,
      sourceIdentifier: product.source_identifier,
      outcome: 'operational_error',
      error: `Supabase RPC error: ${error.message}`,
    };
  }

  const outcome = (data?.outcome || 'created') as LabelSyncOutcome;
  const labelId = data?.label_id as string | undefined;
  const reviewStatus = data?.review_status as NormalizedDrugLabel['reviewStatus'];

  return {
    productId: product.id,
    sourceIdentifier: product.source_identifier,
    outcome,
    labelId,
    reviewStatus,
  };
}

/**
 * High-level synchronization runner for a batch of products.
 */
export async function syncOpenFdaDrugLabelsBatch(
  products: TargetProductForSync[],
  supabase: SupabaseClient | null,
  options: LabelSyncServiceOptions = {}
): Promise<LabelSyncSummary> {
  const startTime = Date.now();
  const summary: LabelSyncSummary = {
    received: products.length,
    matched: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    unmatched: 0,
    ambiguous: 0,
    rejected: 0,
    operationalErrors: 0,
    results: [],
    durationMs: 0,
  };

  for (const product of products) {
    const result = await syncDrugLabelForProduct(product, supabase, options);
    summary.results.push(result);

    switch (result.outcome) {
      case 'created':
        summary.matched++;
        summary.created++;
        break;
      case 'updated':
        summary.matched++;
        summary.updated++;
        break;
      case 'unchanged':
        summary.matched++;
        summary.unchanged++;
        break;
      case 'unmatched':
        summary.unmatched++;
        break;
      case 'ambiguous':
        summary.ambiguous++;
        break;
      case 'rejected':
        summary.rejected++;
        break;
      case 'operational_error':
        summary.operationalErrors++;
        break;
    }
  }

  summary.durationMs = Date.now() - startTime;
  return summary;
}
