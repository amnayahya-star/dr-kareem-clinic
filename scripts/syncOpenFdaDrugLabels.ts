#!/usr/bin/env node
/**
 * CLI Tool for OpenFDA Drug Labeling Synchronization & Provenance Storage
 * 
 * Usage:
 *   npx tsx scripts/syncOpenFdaDrugLabels.ts [options]
 * 
 * Hardened Safety & Audit Invariants:
 *   - Real database records are strictly required. No synthetic fallbacks.
 *   - Dry-Run Mode:
 *       * Reads real target product(s) from Supabase.
 *       * Performs real network queries to openFDA Drug Labeling API.
 *       * Executes real deterministic matching and canonical SHA-256 hash calculation.
 *       * Executes ZERO database write operations.
 *   - Fail-Closed:
 *       * Database query failure -> stops immediately with non-zero exit code and operationalErrors >= 1.
 *       * openFDA network failure -> records operationalErrors and exits with non-zero exit code.
 *       * Missing target product -> reported as unmatched with clear reason without inventing fake records.
 *   - Real writes require BOTH `--no-dry-run` AND the environment variable:
 *     `DR_KAREEM_ALLOW_LABEL_SYNC_WRITE=true`
 *   - Never prints secrets, API keys, or raw full payloads.
 * 
 * Options:
 *   --dry-run             Simulate without writing to DB (DEFAULT: true)
 *   --no-dry-run          Write to database using service_role RPC
 *   --product-id <uuid>   Sync specific drug product by UUID
 *   --product-ndc <ndc>   Sync specific drug product by NDC (e.g. 72189-285)
 *   --clinic-catalog      Filter products currently in clinic_drug_catalog
 *   --limit <number>      Batch size limit (1 to 20, default: 1)
 *   --help, -h            Show this help message
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  syncOpenFdaDrugLabelsBatch,
  TargetProductForSync,
} from '../src/services/openFdaDrugLabelSyncService';

/**
 * Safely loads .env.local without exposing any secret values to stdout.
 */
export function loadEnvLocalSafe(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  try {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // Fail silently in loader; subsequent connection validation enforces strict fail-closed
  }
}

// Load environment variables immediately on startup
loadEnvLocalSafe();

interface CliArgs {
  dryRun: boolean;
  productId?: string;
  productNdc?: string;
  clinicCatalog: boolean;
  limit: number;
  isHelp: boolean;
}

export function parseCliArgs(args: string[]): CliArgs {
  let dryRun = true;
  let productId: string | undefined;
  let productNdc: string | undefined;
  let clinicCatalog = false;
  let limit = 1;
  let isHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--no-dry-run') {
      dryRun = false;
    } else if (arg === '--product-id' && args[i + 1]) {
      productId = args[++i];
    } else if (arg === '--product-ndc' && args[i + 1]) {
      productNdc = args[++i];
    } else if (arg === '--clinic-catalog') {
      clinicCatalog = true;
    } else if (arg === '--limit' && args[i + 1]) {
      const parsed = parseInt(args[++i], 10);
      limit = Math.min(Math.max(1, isNaN(parsed) ? 1 : parsed), 20); // Capped at safe max 20
    }
  }

  return {
    dryRun,
    productId,
    productNdc,
    clinicCatalog,
    limit,
    isHelp,
  };
}

function printHelp() {
  console.log(`
Dr. Kareem Clinic - OpenFDA Drug Label Synchronization CLI
=========================================================

Usage:
  npx tsx scripts/syncOpenFdaDrugLabels.ts [options]

Safety Defaults:
  - Runs in DRY-RUN mode by default (ZERO DB writes).
  - To enable database writes:
      1. Pass --no-dry-run
      2. Set DR_KAREEM_ALLOW_LABEL_SYNC_WRITE=true
  - Bounded to small explicit batches (max limit: 20, default: 1).
  - Fail-closed: halts with non-zero exit code on connection errors.

Options:
  --dry-run             Simulate without writing to DB (DEFAULT)
  --no-dry-run          Write to database using service_role RPC
  --product-id <uuid>   Sync specific drug product by UUID
  --product-ndc <ndc>   Sync specific drug product by NDC (e.g. 72189-285)
  --clinic-catalog      Filter products currently in clinic_drug_catalog
  --limit <num>         Batch size limit (1 to 20, default: 1)
  --help, -h            Show this help message
`);
}

function printSummary(summary: {
  received: number;
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  ambiguous: number;
  rejected: number;
  operationalErrors: number;
  durationMs: number;
}) {
  console.log('\n=================== SYNC SUMMARY ===================');
  console.log(`Received:           ${summary.received}`);
  console.log(`Matched:            ${summary.matched}`);
  console.log(`Created:            ${summary.created}`);
  console.log(`Updated:            ${summary.updated}`);
  console.log(`Unchanged:          ${summary.unchanged}`);
  console.log(`Unmatched:          ${summary.unmatched}`);
  console.log(`Ambiguous:          ${summary.ambiguous}`);
  console.log(`Rejected:           ${summary.rejected}`);
  console.log(`Operational Errors: ${summary.operationalErrors}`);
  console.log(`Duration:           ${summary.durationMs}ms`);
  console.log('====================================================\n');
}

async function main() {
  const startTime = Date.now();
  const args = parseCliArgs(process.argv.slice(2));

  if (args.isHelp) {
    printHelp();
    process.exit(0);
  }

  console.log('---------------------------------------------------------');
  console.log('Dr. Kareem Clinic - OpenFDA Drug Label Sync Tool');
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN (Real openFDA query, zero DB writes)' : 'LIVE-WRITE (Real DB upsert)'}`);
  console.log(`Limit: ${args.limit}`);
  if (args.productId) console.log(`Target Product ID: ${args.productId}`);
  if (args.productNdc) console.log(`Target Product NDC: ${args.productNdc}`);
  if (args.clinicCatalog) console.log('Filter: clinic_drug_catalog entries only');
  console.log('---------------------------------------------------------');

  // Verify write permission requirements if live mode is requested
  if (!args.dryRun) {
    const confirmation = process.env.DR_KAREEM_ALLOW_LABEL_SYNC_WRITE;
    if (confirmation !== 'true') {
      console.error('\n[SAFETY REFUSAL] Live database writes require explicit confirmation!');
      console.error('Please set DR_KAREEM_ALLOW_LABEL_SYNC_WRITE=true in your environment to proceed.');
      printSummary({
        received: 0,
        matched: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        unmatched: 0,
        ambiguous: 0,
        rejected: 1,
        operationalErrors: 1,
        durationMs: Date.now() - startTime,
      });
      process.exit(1);
    }
  }

  // Environment and Credentials Verification (Fail-Closed)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('\n[CONFIG ERROR] Database connection credentials are missing.');
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided via .env.local or environment.');
    printSummary({
      received: 0,
      matched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      unmatched: 0,
      ambiguous: 0,
      rejected: 0,
      operationalErrors: 1,
      durationMs: Date.now() - startTime,
    });
    process.exit(1);
  }

  // Create admin service client for reading target products
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let targetProducts: TargetProductForSync[] = [];

  try {
    let query = supabase
      .from('drug_products')
      .select('id, source_identifier, application_number, source_payload, brand_name, generic_name')
      .limit(args.limit);

    if (args.productId) {
      query = query.eq('id', args.productId);
    } else if (args.productNdc) {
      query = query.eq('source_identifier', args.productNdc);
    } else if (args.clinicCatalog) {
      const { data: catalogData, error: catalogErr } = await supabase
        .from('clinic_drug_catalog')
        .select('product_id')
        .limit(args.limit);

      if (catalogErr) {
        throw new Error(`Failed to query clinic_drug_catalog: ${catalogErr.message}`);
      }

      const productIds = (catalogData || []).map((row) => row.product_id);
      if (productIds.length === 0) {
        console.log('[NOTICE] clinic_drug_catalog is empty; no products to sync.');
        printSummary({
          received: 0,
          matched: 0,
          created: 0,
          updated: 0,
          unchanged: 0,
          unmatched: 0,
          ambiguous: 0,
          rejected: 0,
          operationalErrors: 0,
          durationMs: Date.now() - startTime,
        });
        process.exit(0);
      }
      query = query.in('id', productIds);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to query drug_products from database: ${error.message}`);
    }

    if (!data || data.length === 0) {
      const filterDesc = args.productNdc
        ? `NDC "${args.productNdc}"`
        : args.productId
        ? `Product ID "${args.productId}"`
        : 'the specified criteria';
      console.warn(`[NOT FOUND] No drug product found in Dr. Kareem Clinic database for ${filterDesc}.`);
      printSummary({
        received: 0,
        matched: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
        unmatched: 1,
        ambiguous: 0,
        rejected: 0,
        operationalErrors: 0,
        durationMs: Date.now() - startTime,
      });
      process.exit(0);
    }

    targetProducts = data as TargetProductForSync[];
  } catch (err: unknown) {
    console.error('\n[DATABASE CONNECTION ERROR]', (err as Error)?.message || 'Database error');
    printSummary({
      received: 0,
      matched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      unmatched: 0,
      ambiguous: 0,
      rejected: 0,
      operationalErrors: 1,
      durationMs: Date.now() - startTime,
    });
    process.exit(1);
  }

  console.log(`Found ${targetProducts.length} target product(s) in database. Fetching official openFDA labeling...`);

  // Execute batch sync: In dry-run, pass dryRun: true so write RPC is never called
  const summary = await syncOpenFdaDrugLabelsBatch(targetProducts, supabase, {
    dryRun: args.dryRun,
  });

  printSummary(summary);

  // Fail-closed invariant: If operational errors occurred, exit with non-zero status
  if (summary.operationalErrors > 0) {
    console.error(`[EXECUTION FAILED] Completed with ${summary.operationalErrors} operational error(s).`);
    process.exit(1);
  }

  console.log(args.dryRun ? 'Dry-run completed successfully (Zero DB writes).' : 'Label synchronization completed.');
  process.exit(0);
}

// Run CLI directly if invoked from node
if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('[FATAL UNCAUGHT ERROR]', err?.message || err);
    process.exit(1);
  });
}
