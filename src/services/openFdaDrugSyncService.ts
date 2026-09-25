/**
 * OpenFDA Drug NDC Directory Synchronization Service
 * 
 * Fetches human prescription and OTC drug listings from openFDA NDC API (or local bulk downloads),
 * normalizes fields safely, and synchronizes them into the Medication Knowledge Base schema
 * (Migration 00008 & Migration 00009).
 * 
 * Architectural & Safety Guarantees:
 * - Transactional Per-Product Atomicity: Uses `upsert_openfda_drug_product` RPC
 * - Exact Ingredient Synchronization: Cleans up obsolete product-ingredient links atomically
 * - Strict Date Validation: Never rolls over invalid dates like Feb 30th (converts to null)
 * - Deterministic Canonical JSON SHA-256: Stable hash regardless of key ordering
 * - Rejects empty dosage_form (never uses artificial "Unspecified" fallback)
 * - Restricts source_system to 'FDA_NDC'
 * - NEVER inserts into `clinic_drug_catalog` (Clinic catalog entries are created strictly on doctor demand)
 * - Dual-Mode Import:
 *     * API mode: Strictly bounded by openFDA's 25,000 pagination skip limit
 *     * Bulk-download mode: Reads real openFDA zipped (.zip / .gz / .json) files
 * - Zero Supabase connection required in Dry-Run mode
 * - Multi-layered Production write protection
 */

import { createHash } from 'crypto';
import { spawn } from 'child_process';
import zlib from 'zlib';
import fs from 'fs';
import { Readable, Transform } from 'stream';
import chain from 'stream-chain';
import parser from 'stream-json';
import pick from 'stream-json/filters/pick.js';
import streamArray from 'stream-json/streamers/stream-array.js';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  OpenFdaNdcRecord,
  OpenFdaNdcResponse,
  ParsedStrength,
  NormalizedDrugRecord,
  NormalizedIngredientItem,
  SyncOptions,
  SyncStats,
  ProductUpsertResult,
  ProductUpsertOutcome,
} from '../types/openfda';

export const OPENFDA_NDC_DEFAULT_BASE_URL = 'https://api.fda.gov/drug/ndc.json';
export const OPENFDA_API_PAGINATION_LIMIT = 25000;

/**
 * Produces a stable, deterministic JSON string with recursively sorted keys.
 * Ensures SHA-256 hash never varies due to arbitrary object key ordering.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalJsonStringify(item)).join(',')}]`;
  }
  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const entries = sortedKeys.map((key) => {
    return `${JSON.stringify(key)}:${canonicalJsonStringify(record[key])}`;
  });
  return `{${entries.join(',')}}`;
}

/**
 * Checks whether a given calendar date is strictly valid (prevents rollover like Feb 30th).
 * Returns 'YYYY-MM-DD' if strictly valid, otherwise null.
 */
export function validateAndFormatDate(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  let year: number;
  let month: number;
  let day: number;

  if (/^\d{8}$/.test(trimmed)) {
    year = parseInt(trimmed.substring(0, 4), 10);
    month = parseInt(trimmed.substring(4, 6), 10);
    day = parseInt(trimmed.substring(6, 8), 10);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    year = parseInt(trimmed.substring(0, 4), 10);
    month = parseInt(trimmed.substring(5, 7), 10);
    day = parseInt(trimmed.substring(8, 10), 10);
  } else {
    return null;
  }

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // Days per month validation with leap year check
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonths = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (day > daysInMonths[month - 1]) {
    // Explicitly convert invalid dates like 2026-02-30 to null
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/**
 * Checks if a drug record represents a human drug (Prescription or OTC).
 * Excludes veterinary and non-human listings.
 */
export function isHumanDrug(record: OpenFdaNdcRecord): boolean {
  const pType = (record.product_type || '').toUpperCase();
  const openFdaTypes = (record.openfda?.product_type || []).map((t) => t.toUpperCase());

  const hasHumanType =
    pType.includes('HUMAN PRESCRIPTION') ||
    pType.includes('HUMAN OTC') ||
    openFdaTypes.some((t) => t.includes('HUMAN PRESCRIPTION') || t.includes('HUMAN OTC'));

  const isVeterinary =
    pType.includes('VETERINARY') ||
    openFdaTypes.some((t) => t.includes('VETERINARY'));

  return hasHumanType && !isVeterinary;
}

/**
 * Safely parses active ingredient strength into structured numerator and denominator.
 * Enforces PostgreSQL CHECK constraints:
 * - Numerator and unit must both be null OR (value > 0 AND unit non-empty)
 * - Denominator and unit must both be null OR (value > 0 AND unit non-empty)
 * Returns all nulls if the raw string cannot be cleanly parsed as strictly positive numbers.
 */
export function parseStrength(rawStrength?: string | null): ParsedStrength {
  if (!rawStrength || typeof rawStrength !== 'string') {
    return {
      numeratorValue: null,
      numeratorUnit: null,
      denominatorValue: null,
      denominatorUnit: null,
      rawString: null,
    };
  }

  const trimmed = rawStrength.trim();
  if (!trimmed) {
    return {
      numeratorValue: null,
      numeratorUnit: null,
      denominatorValue: null,
      denominatorUnit: null,
      rawString: null,
    };
  }

  // Common pattern: "500 mg/1", "250 mg/5mL", "10 mg/mL", ".7 mL/mL", ".1 g/100mL"
  const slashMatch = trimmed.match(
    /^([0-9]*\.?[0-9]+)\s*([a-zA-Z%µμ]+(?:\s+[a-zA-Z]+)?)\s*\/\s*(?:([0-9]*\.?[0-9]+)\s*)?([a-zA-Z0-9]+)?$/
  );

  if (slashMatch) {
    const numVal = parseFloat(slashMatch[1]);
    const numUnit = (slashMatch[2] || '').trim();
    const denValStr = slashMatch[3];
    const denUnitStr = (slashMatch[4] || '').trim();

    if (Number.isFinite(numVal) && numVal > 0 && numUnit.length > 0) {
      let denVal: number | null = null;
      let denUnit: string | null = null;

      if (denValStr && denUnitStr) {
        const parsedDen = parseFloat(denValStr);
        if (Number.isFinite(parsedDen) && parsedDen > 0) {
          denVal = parsedDen;
          denUnit = denUnitStr;
        }
      } else if (denUnitStr && !denValStr) {
        denVal = 1;
        denUnit = denUnitStr;
      } else if (denValStr && !denUnitStr) {
        const parsedDen = parseFloat(denValStr);
        if (Number.isFinite(parsedDen) && parsedDen > 0) {
          denVal = parsedDen;
          denUnit = 'dose';
        }
      }

      if (
        (denVal === null && denUnit === null) ||
        (denVal !== null && denVal > 0 && denUnit !== null && denUnit.length > 0)
      ) {
        return {
          numeratorValue: numVal,
          numeratorUnit: numUnit,
          denominatorValue: denVal,
          denominatorUnit: denUnit,
          rawString: trimmed,
        };
      }
    }
  }

  // Single unit pattern: "500 mg", "0.5 %", "100 IU"
  const singleMatch = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z%µμ]+)$/);
  if (singleMatch) {
    const numVal = parseFloat(singleMatch[1]);
    const numUnit = (singleMatch[2] || '').trim();
    if (Number.isFinite(numVal) && numVal > 0 && numUnit.length > 0) {
      return {
        numeratorValue: numVal,
        numeratorUnit: numUnit,
        denominatorValue: null,
        denominatorUnit: null,
        rawString: trimmed,
      };
    }
  }

  return {
    numeratorValue: null,
    numeratorUnit: null,
    denominatorValue: null,
    denominatorUnit: null,
    rawString: trimmed,
  };
}

/**
 * Normalizes, cleans, and validates a raw openFDA NDC record into database-ready payload.
 * Rejects empty dosage_form strictly without inserting artificial values.
 */
export function normalizeNdcRecord(
  raw: OpenFdaNdcRecord,
  metaLastUpdated?: string
): NormalizedDrugRecord {
  const productNdc = (raw.product_ndc || '').trim();
  const genericName = (raw.generic_name || '').trim();
  const rawBrand = (raw.brand_name || '').trim();
  const brandName = rawBrand.length > 0 ? rawBrand : null;
  const dosageForm = (raw.dosage_form || '').trim();

  // Basic presence checks
  if (!productNdc) {
    return {
      productNdc: '',
      genericName: '',
      brandName: null,
      displayName: '',
      dosageForm: '',
      route: null,
      marketingCategory: null,
      applicationNumber: null,
      labelerName: null,
      marketingStartDate: null,
      marketingEndDate: null,
      sourceUpdatedAt: null,
      activeIngredients: [],
      payloadHash: '',
      sourcePayload: {},
      isHumanDrug: false,
      isValid: false,
      rejectionReason: 'Missing product_ndc identifier',
    };
  }

  if (!isHumanDrug(raw)) {
    return {
      productNdc,
      genericName,
      brandName,
      displayName: '',
      dosageForm,
      route: null,
      marketingCategory: null,
      applicationNumber: null,
      labelerName: null,
      marketingStartDate: null,
      marketingEndDate: null,
      sourceUpdatedAt: null,
      activeIngredients: [],
      payloadHash: '',
      sourcePayload: {},
      isHumanDrug: false,
      isValid: false,
      rejectionReason: `Non-human product_type: ${raw.product_type || 'unspecified'}`,
    };
  }

  if (!genericName) {
    return {
      productNdc,
      genericName: '',
      brandName,
      displayName: '',
      dosageForm,
      route: null,
      marketingCategory: null,
      applicationNumber: null,
      labelerName: null,
      marketingStartDate: null,
      marketingEndDate: null,
      sourceUpdatedAt: null,
      activeIngredients: [],
      payloadHash: '',
      sourcePayload: {},
      isHumanDrug: true,
      isValid: false,
      rejectionReason: 'Missing generic_name',
    };
  }

  // Invariant 1: Reject empty dosage_form (Never use artificial "Unspecified")
  if (!dosageForm) {
    return {
      productNdc,
      genericName,
      brandName,
      displayName: '',
      dosageForm: '',
      route: null,
      marketingCategory: null,
      applicationNumber: null,
      labelerName: null,
      marketingStartDate: null,
      marketingEndDate: null,
      sourceUpdatedAt: null,
      activeIngredients: [],
      payloadHash: '',
      sourcePayload: {},
      isHumanDrug: true,
      isValid: false,
      rejectionReason: 'Missing or empty dosage_form',
    };
  }

  // Parse active ingredients
  const activeIngredients: NormalizedIngredientItem[] = [];
  if (Array.isArray(raw.active_ingredients)) {
    for (const item of raw.active_ingredients) {
      const name = (item.name || '').trim();
      if (name.length > 0) {
        const rawStrength = item.strength ? item.strength.trim() : null;
        activeIngredients.push({
          preferredName: name,
          normalizedName: name.toLowerCase(),
          rawStrength,
          strength: parseStrength(rawStrength),
        });
      }
    }
  }

  // Invariant: Must have at least 1 active ingredient
  if (activeIngredients.length === 0) {
    return {
      productNdc,
      genericName,
      brandName,
      displayName: '',
      dosageForm,
      route: null,
      marketingCategory: null,
      applicationNumber: null,
      labelerName: null,
      marketingStartDate: null,
      marketingEndDate: null,
      sourceUpdatedAt: null,
      activeIngredients: [],
      payloadHash: '',
      sourcePayload: {},
      isHumanDrug: true,
      isValid: false,
      rejectionReason: 'Missing active_ingredients',
    };
  }

  const rawRoutes = Array.isArray(raw.route)
    ? raw.route.map((r) => r.trim()).filter(Boolean)
    : [];
  const route = rawRoutes.length > 0 ? rawRoutes.join(', ') : null;

  let displayName = '';
  if (brandName && brandName.toUpperCase() !== genericName.toUpperCase()) {
    displayName = `${brandName} [${genericName}] ${dosageForm}`.trim();
  } else {
    displayName = `${genericName} ${dosageForm}`.trim();
  }

  const marketingCategory = (raw.marketing_category || '').trim() || null;
  const applicationNumber = (raw.application_number || '').trim() || null;
  const labelerName = (raw.labeler_name || '').trim() || null;
  const marketingStartDate = validateAndFormatDate(raw.marketing_start_date);
  const marketingEndDate = validateAndFormatDate(raw.marketing_end_date);
  const sourceUpdatedAt = metaLastUpdated ? metaLastUpdated.trim() : null;

  // Canonical payload representation
  const canonicalPayload: Record<string, unknown> = {
    source_system: 'FDA_NDC',
    product_ndc: productNdc,
    generic_name: genericName,
    brand_name: brandName,
    dosage_form: dosageForm,
    route,
    marketing_category: marketingCategory,
    application_number: applicationNumber,
    labeler_name: labelerName,
    marketing_start_date: marketingStartDate,
    marketing_end_date: marketingEndDate,
    source_updated_at: sourceUpdatedAt,
    active_ingredients: activeIngredients.map((i) => ({
      name: i.preferredName,
      raw_strength: i.rawStrength,
      numerator: i.strength.numeratorValue,
      denominator: i.strength.denominatorValue,
    })),
    packaging_count: Array.isArray(raw.packaging) ? raw.packaging.length : 0,
  };

  // Deterministic 64-char SHA-256 Hex Hash using Canonical JSON
  const payloadHash = createHash('sha256')
    .update(canonicalJsonStringify(canonicalPayload))
    .digest('hex');

  return {
    productNdc,
    genericName,
    brandName,
    displayName,
    dosageForm,
    route,
    marketingCategory,
    applicationNumber,
    labelerName,
    marketingStartDate,
    marketingEndDate,
    sourceUpdatedAt,
    activeIngredients,
    payloadHash,
    sourcePayload: canonicalPayload,
    metadataSnapshot: canonicalPayload,
    isHumanDrug: true,
    isValid: true,
  };
}

/**
 * Fetches a single page of NDC listings from openFDA API with bounded retries and exponential backoff.
 */
export async function fetchOpenFdaNdcPage(options: {
  skip: number;
  limit: number;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  backoffMs?: number;
  targetProductType?: 'HUMAN_PRESCRIPTION' | 'HUMAN_OTC' | 'ALL_HUMAN';
}): Promise<OpenFdaNdcResponse> {
  const {
    skip,
    limit,
    apiKey,
    baseUrl = OPENFDA_NDC_DEFAULT_BASE_URL,
    fetchImpl = fetch,
    maxRetries = 3,
    backoffMs = 500,
    targetProductType = 'ALL_HUMAN',
  } = options;

  if (skip >= OPENFDA_API_PAGINATION_LIMIT) {
    throw new Error(
      `OpenFDA API pagination limit exceeded (skip=${skip} >= ${OPENFDA_API_PAGINATION_LIMIT}). Full catalog synchronization requires bulk-download mode.`
    );
  }

  let searchQuery = 'product_type:("HUMAN+PRESCRIPTION+DRUG"+OR+"HUMAN+OTC+DRUG")';
  if (targetProductType === 'HUMAN_PRESCRIPTION') {
    searchQuery = 'product_type:"HUMAN+PRESCRIPTION+DRUG"';
  } else if (targetProductType === 'HUMAN_OTC') {
    searchQuery = 'product_type:"HUMAN+OTC+DRUG"';
  }

  const queryParts = [
    `search=${searchQuery}`,
    `skip=${encodeURIComponent(skip)}`,
    `limit=${encodeURIComponent(limit)}`,
  ];

  if (apiKey) {
    queryParts.push(`api_key=${encodeURIComponent(apiKey)}`);
  }

  const url = `${baseUrl}?${queryParts.join('&')}`;

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'DrKareemClinic-MedicationSync/2.0',
        },
      });

      if (response.ok) {
        const json = (await response.json()) as OpenFdaNdcResponse;
        return json;
      }

      if (response.status === 404) {
        return {
          results: [],
          meta: {
            results: { skip, limit, total: 0 },
          },
        };
      }

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        attempt++;
        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      const errorText = await response.text().catch(() => 'Unknown HTTP error');
      throw new Error(`OpenFDA API HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    } catch (err: unknown) {
      if (attempt < maxRetries) {
        attempt++;
        const delay = backoffMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error(`OpenFDA request failed after ${maxRetries} retries`);
}

/**
 * Loads records from real openFDA bulk files (.zip, .gz, or raw .json) using true streaming.
 * Processes items sequentially with bounded memory and terminates early as soon as `limit` records are collected.
 */
export async function readOpenFdaBulkFile(
  filePath: string,
  skip: number,
  limit: number
): Promise<{ records: OpenFdaNdcRecord[]; total: number; metaLastUpdated?: string }> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Bulk file not found: ${filePath}`);
  }

  let inputStream: Readable;
  let childProcess: ReturnType<typeof spawn> | null = null;
  let sourceFileStream: fs.ReadStream | null = null;
  let gunzipStream: zlib.Gunzip | null = null;
  let stderrOutput = '';

  if (filePath.endsWith('.zip')) {
    childProcess = spawn('unzip', ['-p', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      stderrOutput += chunk.toString();
    });

    if (!childProcess.stdout) {
      throw new Error(`Failed to initialize stdout stream for unzip process (${filePath})`);
    }

    inputStream = childProcess.stdout;
  } else if (filePath.endsWith('.gz')) {
    sourceFileStream = fs.createReadStream(filePath);
    gunzipStream = zlib.createGunzip();
    sourceFileStream.pipe(gunzipStream);
    inputStream = gunzipStream;

    sourceFileStream.on('error', (err) => {
      if (gunzipStream && !gunzipStream.destroyed) {
        gunzipStream.destroy(err);
      }
    });
  } else {
    sourceFileStream = fs.createReadStream(filePath);
    inputStream = sourceFileStream;
  }

  let metaLastUpdated: string | undefined;
  let metaTotal: number | undefined;
  let lastKey = '';
  let inMeta = false;
  let inMetaResults = false;
  let isEarlyExit = false;
  let cleanedUp = false;

  const inspector = new Transform({
    objectMode: true,
    transform(chunk: { name: string; value?: unknown }, _encoding, callback) {
      if (chunk.name === 'keyValue' && typeof chunk.value === 'string') {
        lastKey = chunk.value;
        if (lastKey === 'meta') {
          inMeta = true;
        } else if (lastKey === 'results' && inMeta) {
          inMetaResults = true;
        } else if (lastKey === 'results' && !inMeta) {
          inMetaResults = false;
        }
      } else if (chunk.name === 'endObject' && inMetaResults) {
        inMetaResults = false;
      } else if (chunk.name === 'endObject' && inMeta) {
        inMeta = false;
      } else if (inMeta && lastKey === 'last_updated' && chunk.name === 'stringValue' && typeof chunk.value === 'string') {
        metaLastUpdated = chunk.value;
      } else if (inMetaResults && lastKey === 'total' && chunk.name === 'numberValue') {
        const parsedNum = typeof chunk.value === 'number' ? chunk.value : parseInt(String(chunk.value), 10);
        if (Number.isFinite(parsedNum)) {
          metaTotal = parsedNum;
        }
      }
      callback(null, chunk);
    },
  });

  const pipeline = chain([
    inputStream,
    parser(),
    inspector,
    pick.asStream({ filter: 'results' }),
    streamArray.asStream(),
  ]);

  const records: OpenFdaNdcRecord[] = [];
  let currentIndex = 0;

  return new Promise((resolve, reject) => {
    let settled = false;

    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      try {
        pipeline.destroy();
      } catch (_) {}
      try {
        inputStream.destroy();
      } catch (_) {}
      if (gunzipStream) {
        try {
          gunzipStream.destroy();
        } catch (_) {}
      }
      if (sourceFileStream) {
        try {
          sourceFileStream.destroy();
        } catch (_) {}
      }
      if (childProcess && !childProcess.killed) {
        try {
          childProcess.kill('SIGTERM');
        } catch (_) {}
      }
    }

    if (sourceFileStream) {
      sourceFileStream.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
    }

    if (gunzipStream) {
      gunzipStream.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
    }

    pipeline.on('data', (item: { key: number; value: OpenFdaNdcRecord }) => {
      if (currentIndex >= skip && records.length < limit) {
        records.push(item.value);
      }
      currentIndex++;

      if (records.length >= limit) {
        settled = true;
        isEarlyExit = true;
        cleanup();
        resolve({
          records,
          total: metaTotal !== undefined ? metaTotal : currentIndex,
          metaLastUpdated,
        });
      }
    });

    pipeline.on('end', () => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve({
          records,
          total: metaTotal !== undefined ? metaTotal : currentIndex,
          metaLastUpdated,
        });
      }
    });

    pipeline.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (childProcess) {
        reject(
          new Error(
            `Failed to extract bulk zip file (${filePath}): ${stderrOutput.trim() || err.message}`
          )
        );
      } else {
        reject(err);
      }
    });

    if (childProcess) {
      childProcess.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Failed to extract bulk zip file (${filePath}): ${err.message}`));
      });

      childProcess.on('close', (code: number | null) => {
        if (settled) return;
        if (code !== 0 && !isEarlyExit) {
          settled = true;
          cleanup();
          reject(
            new Error(
              `Failed to extract bulk zip file (${filePath}): unzip exited with code ${code}${
                stderrOutput ? ` - ${stderrOutput.trim()}` : ''
              }`
            )
          );
        }
      });
    }
  });
}

/**
 * Main synchronization engine for openFDA Drug NDC data.
 */
export async function syncOpenFdaDrugs(
  supabase: SupabaseClient | null,
  options: SyncOptions = {}
): Promise<SyncStats> {
  const startTime = Date.now();
  const {
    mode = 'api',
    bulkFilePath,
    limit = 50,
    skip = 0,
    maxRecords = 50,
    dryRun = true,
    apiKey = process.env.OPENFDA_API_KEY,
    baseUrl = process.env.OPENFDA_API_BASE_URL || OPENFDA_NDC_DEFAULT_BASE_URL,
    maxRetries = 3,
    backoffMs = 400,
    fetchImpl = fetch,
    targetProductType = 'ALL_HUMAN',
  } = options;

  const stats: SyncStats = {
    mode,
    dryRun,
    totalReceived: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    ingredientsCreated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    productsUnchanged: 0,
    catalogEntriesCreated: 0, // Strict Invariant: Always 0 in sync
    rejectionReasons: {},
    batchesProcessed: 0,
    durationMs: 0,
    errors: [],
  };

  const seenNdcs = new Set<string>();
  let syncRunId: string | undefined;

  // Initialize DB run logging ONLY if performing real DB writes
  if (!dryRun && supabase) {
    try {
      const { data: runData, error: runError } = await supabase
        .from('drug_sync_runs')
        .insert({
          run_type: mode === 'bulk_download' ? 'monthly_refresh' : 'manual_sync',
          source_system: 'FDA_NDC',
          status: 'running',
          processed_count: 0,
          cached_count: 0,
          updated_count: 0,
          errors_count: 0,
        })
        .select('id')
        .single();

      if (runError) {
        stats.errors.push(`Failed to initialize sync run record: ${runError.message}`);
      } else if (runData) {
        syncRunId = runData.id;
        stats.syncRunId = syncRunId;
      }
    } catch (e: unknown) {
      stats.errors.push(`Sync run DB init exception: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let currentSkip = skip;
  let remainingRecords = maxRecords;

  try {
    while (remainingRecords > 0) {
      if (mode === 'api' && currentSkip >= OPENFDA_API_PAGINATION_LIMIT) {
        stats.errors.push(
          `Reached openFDA API limit of ${OPENFDA_API_PAGINATION_LIMIT} records. Switch to mode='bulk_download' for full catalog synchronization.`
        );
        break;
      }

      const pageLimit = Math.min(limit, remainingRecords);
      let records: OpenFdaNdcRecord[] = [];
      let metaLastUpdated: string | undefined;
      let totalAvailable: number | undefined;

      if (mode === 'bulk_download') {
        if (!bulkFilePath) {
          throw new Error("bulkFilePath must be specified when mode is 'bulk_download'");
        }
        const bulkData = await readOpenFdaBulkFile(bulkFilePath, currentSkip, pageLimit);
        records = bulkData.records;
        metaLastUpdated = bulkData.metaLastUpdated;
        totalAvailable = bulkData.total;
      } else {
        const response = await fetchOpenFdaNdcPage({
          skip: currentSkip,
          limit: pageLimit,
          apiKey,
          baseUrl,
          fetchImpl,
          maxRetries,
          backoffMs,
          targetProductType,
        });
        records = response.results || [];
        metaLastUpdated = response.meta?.last_updated;
        totalAvailable = response.meta?.results?.total;
      }

      if (records.length === 0) {
        break;
      }

      stats.totalReceived += records.length;

      const normalizedBatch: NormalizedDrugRecord[] = [];
      for (const raw of records) {
        const normalized = normalizeNdcRecord(raw, metaLastUpdated);
        if (!normalized.isValid) {
          stats.rejected++;
          const reason = normalized.rejectionReason || 'Invalid record';
          stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
          continue;
        }

        if (seenNdcs.has(normalized.productNdc)) {
          stats.duplicates++;
          continue;
        }

        seenNdcs.add(normalized.productNdc);
        normalizedBatch.push(normalized);
        stats.accepted++;
      }

      // If dry-run: perform simulation counts only (ZERO DB writes, NO client needed)
      if (dryRun || !supabase) {
        for (const item of normalizedBatch) {
          stats.productsCreated++;
          stats.ingredientsCreated += item.activeIngredients.length;
        }
      } else {
        // Real DB Writes: Execute Transactional Per-Product RPC
        for (const item of normalizedBatch) {
          await persistProductViaRpc(supabase, item, stats);
        }
        stats.batchesProcessed++;
      }

      currentSkip += records.length;
      remainingRecords -= records.length;

      if (totalAvailable !== undefined && currentSkip >= totalAvailable) {
        break;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stats.errors.push(message);
  } finally {
    stats.durationMs = Date.now() - startTime;

    // Finalize DB run logging
    if (!dryRun && supabase && syncRunId) {
      try {
        const operationalErrorsCount = stats.errors.length;
        const successfulCount =
          stats.productsCreated + stats.productsUpdated + stats.productsUnchanged;

        // Requirement 7:
        // - status = success if NO operational errors occurred, even with rejected records
        // - status = partial if some products succeeded and others failed due to operational errors
        // - status = failed if no operations succeeded due to operational errors
        const finalStatus =
          operationalErrorsCount === 0
            ? 'success'
            : successfulCount > 0
              ? 'partial'
              : 'failed';

        await supabase
          .from('drug_sync_runs')
          .update({
            completed_at: new Date().toISOString(),
            status: finalStatus,
            processed_count: stats.totalReceived,
            accepted_count: stats.accepted,
            rejected_count: stats.rejected,
            created_count: stats.productsCreated,
            updated_count: stats.productsUpdated,
            unchanged_count: stats.productsUnchanged,
            // Requirement 4: cached_count represents total successfully processed products
            cached_count: successfulCount,
            errors_count: operationalErrorsCount,
            error_log: operationalErrorsCount > 0 ? stats.errors.join('\n') : null,
          })
          .eq('id', syncRunId);
      } catch (finalizeErr: unknown) {
        stats.errors.push(
          `Failed to finalize sync run: ${
            finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr)
          }`
        );
      }
    }
  }

  return stats;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Persists a single normalized drug record atomically via the `upsert_openfda_drug_product` RPC.
 * Fail-Closed parsing: Malformed results or unknown outcomes are treated as operational errors.
 */
async function persistProductViaRpc(
  supabase: SupabaseClient,
  item: NormalizedDrugRecord,
  stats: SyncStats
): Promise<void> {
  try {
    const productPayload = {
      source_system: 'FDA_NDC',
      source_identifier: item.productNdc,
      brand_name: item.brandName,
      generic_name: item.genericName,
      display_name: item.displayName,
      dosage_form: item.dosageForm,
      route: item.route,
      marketing_category: item.marketingCategory,
      application_number: item.applicationNumber,
      labeler_name: item.labelerName,
      marketing_start_date: item.marketingStartDate,
      marketing_end_date: item.marketingEndDate,
      source_updated_at: item.sourceUpdatedAt,
      payload_hash: item.payloadHash,
      source_payload: item.sourcePayload,
    };

    const ingredientsPayload = item.activeIngredients.map((ing, idx) => ({
      preferred_name: ing.preferredName,
      normalized_name: ing.normalizedName,
      strength_numerator_value: ing.strength.numeratorValue,
      strength_numerator_unit: ing.strength.numeratorUnit,
      strength_denominator_value: ing.strength.denominatorValue,
      strength_denominator_unit: ing.strength.denominatorUnit,
      display_order: idx + 1,
    }));

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'upsert_openfda_drug_product',
      {
        p_product: productPayload,
        p_ingredients: ingredientsPayload,
      }
    );

    if (rpcError) {
      stats.errors.push(`RPC failed for product ${item.productNdc}: ${rpcError.message}`);
      return;
    }

    // Fail-Closed Validation (Requirement 5)
    if (
      typeof rpcResult !== 'object' ||
      rpcResult === null ||
      typeof (rpcResult as any).product_id !== 'string' ||
      !UUID_REGEX.test((rpcResult as any).product_id) ||
      !['created', 'updated', 'unchanged'].includes((rpcResult as any).outcome)
    ) {
      stats.errors.push(
        `Malformed or unknown RPC outcome for product ${item.productNdc}: ${JSON.stringify(
          rpcResult
        )}`
      );
      return;
    }

    const { outcome } = rpcResult as ProductUpsertResult;

    if (outcome === 'created') {
      stats.productsCreated++;
      stats.ingredientsCreated += item.activeIngredients.length;
    } else if (outcome === 'updated') {
      stats.productsUpdated++;
      stats.ingredientsCreated += item.activeIngredients.length;
    } else if (outcome === 'unchanged') {
      stats.productsUnchanged++;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    stats.errors.push(`Atomic persistence error for ${item.productNdc}: ${msg}`);
  }
}
