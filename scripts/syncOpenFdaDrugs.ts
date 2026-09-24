#!/usr/bin/env node
/**
 * Standalone CLI tool to synchronize openFDA Drug NDC data into Dr. Kareem Clinic database.
 * 
 * Usage:
 *   npx tsx scripts/syncOpenFdaDrugs.ts [options]
 * 
 * Options:
 *   --dry-run             Simulate fetch and parsing without database writes (DEFAULT: true)
 *   --no-dry-run          Enable real database writes (requires non-production confirmation)
 *   --mode <mode>         Import mode: api | bulk_download (default: api)
 *   --file <path>         Path to bulk openFDA JSON file (required if mode is bulk_download)
 *   --limit <number>      Records per openFDA request page (default: 50, max: 100)
 *   --skip <number>       Initial offset to resume from (default: 0, api max: 25000)
 *   --max-records <num>   Maximum total records to process in this run (default: 50)
 *   --type <type>         Target type: ALL_HUMAN | HUMAN_PRESCRIPTION | HUMAN_OTC (default: ALL_HUMAN)
 *   --help                Display this help message
 * 
 * Safety invariants:
 *   - By default runs in DRY-RUN mode (zero Supabase connection or credentials needed).
 *   - NEVER connects to or modifies Supabase Production database.
 *   - Will refuse to run in write mode if pointing to production without explicit confirmation.
 *   - In API mode, respects openFDA's hard 25,000 pagination skip limit.
 */

import { syncOpenFdaDrugs, OPENFDA_API_PAGINATION_LIMIT } from '../src/services/openFdaDrugSyncService';
import { SyncOptions } from '../src/types/openfda';
import { createClient } from '@supabase/supabase-js';

function parseCliArgs(args: string[]): { options: SyncOptions; isHelp: boolean } {
  let dryRun = true;
  let mode: SyncOptions['mode'] = 'api';
  let bulkFilePath: string | undefined;
  let limit = 50;
  let skip = 0;
  let maxRecords = 50;
  let targetProductType: SyncOptions['targetProductType'] = 'ALL_HUMAN';
  let isHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      isHelp = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--no-dry-run') {
      dryRun = false;
    } else if (arg === '--mode' && args[i + 1]) {
      const m = args[++i];
      if (m === 'api' || m === 'bulk_download') {
        mode = m;
      }
    } else if (arg === '--file' && args[i + 1]) {
      bulkFilePath = args[++i];
    } else if (arg === '--limit' && args[i + 1]) {
      limit = Math.min(Math.max(1, parseInt(args[++i], 10) || 50), 100);
    } else if (arg === '--skip' && args[i + 1]) {
      skip = Math.max(0, parseInt(args[++i], 10) || 0);
    } else if (arg === '--max-records' && args[i + 1]) {
      maxRecords = Math.max(1, parseInt(args[++i], 10) || 50);
    } else if (arg === '--type' && args[i + 1]) {
      const t = args[++i];
      if (t === 'HUMAN_PRESCRIPTION' || t === 'HUMAN_OTC' || t === 'ALL_HUMAN') {
        targetProductType = t;
      }
    }
  }

  return {
    options: {
      dryRun,
      mode,
      bulkFilePath,
      limit,
      skip,
      maxRecords,
      targetProductType,
    },
    isHelp,
  };
}

function printHelp() {
  console.log(`
OpenFDA Drug NDC Synchronization Tool (Dr. Kareem Clinic)
=========================================================

Usage:
  npx tsx scripts/syncOpenFdaDrugs.ts [options]

Options:
  --dry-run             Simulate only, no DB connection needed (DEFAULT)
  --no-dry-run          Write to local/test database via transactional RPC
  --mode <mode>         Mode: 'api' (capped at 25,000) or 'bulk_download' (for full catalog)
  --file <path>         Path to local openFDA JSON file (for bulk_download mode)
  --limit <num>         Records per API page (1-100, default: 50)
  --skip <num>          Skip offset for pagination (default: 0)
  --max-records <num>   Total records limit (default: 50)
  --type <type>         Target: ALL_HUMAN | HUMAN_PRESCRIPTION | HUMAN_OTC
  --help                Show this message

Safety Guarantee:
  Dry-run requires zero Supabase credentials.
  Write mode is strictly protected against running on Production without explicit confirmation.
`);
}

async function main() {
  const { options, isHelp } = parseCliArgs(process.argv.slice(2));

  if (isHelp) {
    printHelp();
    process.exit(0);
  }

  console.log('====================================================');
  console.log('  OpenFDA NDC Drug Sync Engine (Hardened v2.0)');
  console.log('====================================================');
  console.log(`Execution Mode:  ${options.dryRun ? 'DRY-RUN (Safe Simulation - Zero DB Writes)' : 'REAL DB WRITE'}`);
  console.log(`Import Mode:     ${options.mode === 'api' ? 'API (bounded at ' + OPENFDA_API_PAGINATION_LIMIT + ')' : 'BULK DOWNLOAD (' + (options.bulkFilePath || 'no file') + ')'}`);
  console.log(`Target Type:     ${options.targetProductType}`);
  console.log(`Max Records:     ${options.maxRecords}`);
  console.log(`Page Limit:      ${options.limit}`);
  console.log(`Start Offset:    ${options.skip}`);
  console.log('----------------------------------------------------');

  let supabase = null;

  // In dry-run mode, we intentionally NEVER initialize or require Supabase
  if (!options.dryRun) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    // Production safety guard: Strictly verify project ref
    const isProductionUrl =
      supabaseUrl.includes('rgdgzpowlrlqbxpnzflk') ||
      supabaseUrl.includes('supabase.co');

    if (isProductionUrl) {
      const explicitConfirmation = process.env.CONFIRM_APPLY_DR_KAREEM_CLINIC_PRODUCTION;
      if (explicitConfirmation !== 'YES_I_CONFIRM_OVERWRITE') {
        console.error('⛔ REFUSAL TO EXECUTE: Real write mode is blocked on Dr. Kareem Clinic Production.');
        console.error('   Running write mode requires explicit environment variable CONFIRM_APPLY_DR_KAREEM_CLINIC_PRODUCTION=YES_I_CONFIRM_OVERWRITE');
        console.error('   Falling back to dry-run mode.');
        options.dryRun = true;
      }
    }

    if (!options.dryRun) {
      if (!supabaseUrl || !serviceRoleKey) {
        console.warn('⚠️  Supabase URL or Service Role Key missing. Falling back to dry-run mode.');
        options.dryRun = true;
      } else {
        supabase = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        });
      }
    }
  }

  console.log('Starting sync process...\n');
  const stats = await syncOpenFdaDrugs(supabase, options);

  console.log('====================================================');
  console.log('  Sync Execution Summary');
  console.log('====================================================');
  console.log(`Execution Mode:          ${stats.dryRun ? 'DRY-RUN (Simulated)' : 'APPLIED TO DB'}`);
  console.log(`Import Mode:             ${stats.mode}`);
  console.log(`Duration:                ${stats.durationMs} ms`);
  console.log(`Total Records Received:  ${stats.totalReceived}`);
  console.log(`Accepted Records:        ${stats.accepted}`);
  console.log(`Rejected Records:        ${stats.rejected}`);
  console.log(`Duplicate Records:       ${stats.duplicates}`);
  console.log(`Products Created:        ${stats.productsCreated}`);
  console.log(`Products Updated:        ${stats.productsUpdated}`);
  console.log(`Ingredients Extracted:   ${stats.ingredientsCreated}`);
  console.log(`Catalog Entries:         ${stats.catalogEntriesCreated} (Guaranteed 0 - Demand Only)`);
  console.log(`Batches Processed:       ${stats.batchesProcessed}`);

  if (Object.keys(stats.rejectionReasons).length > 0) {
    console.log('\nRejection Breakdown:');
    for (const [reason, count] of Object.entries(stats.rejectionReasons)) {
      console.log(`  - ${reason}: ${count}`);
    }
  }

  if (stats.errors.length > 0) {
    console.log('\nWarnings / Errors:');
    for (const err of stats.errors) {
      console.log(`  ! ${err}`);
    }
  }

  console.log('====================================================');
  console.log('Completed successfully.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal sync failure:', err);
    process.exit(1);
  });
}
