// CLI wrapper around the Klubfunder sync core. Run from the repo root with:
//   pnpm sync-klubfunder <csv-path>          # dry run, prints the plan
//   pnpm sync-klubfunder <csv-path> --apply  # executes the plan

import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, '..');
loadEnv({ path: resolve(siteRoot, '.env') });

import { createSupabaseAdminClient } from '../src/lib/supabase/admin';
import {
  applyPlan,
  computePlan,
  describeApplyResult,
  describePlan,
  loadExistingState,
  parseKlubfunderCSV,
  planIsEmpty,
} from '../src/lib/sync/klubfunder';

interface CliArgs {
  csvPath: string;
  apply: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  if (args.length === 0) {
    fail('Usage: pnpm sync-klubfunder <csv-path> [--apply]');
  }
  let csvPath: string | undefined;
  let apply = false;
  for (const a of args) {
    if (a === '--apply') apply = true;
    else if (a.startsWith('-')) fail(`Unknown flag: ${a}`);
    else if (!csvPath) csvPath = a;
    else fail(`Unexpected argument: ${a}`);
  }
  if (!csvPath) fail('Missing CSV path');
  return { csvPath: csvPath as string, apply };
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) fail(`Missing required env var: ${name} (expected in apps/site/.env)`);
  return v;
}

async function main() {
  const { csvPath, apply } = parseArgs(process.argv);

  const url = requireEnv('PUBLIC_SUPABASE_URL');
  const secretKey = requireEnv('SUPABASE_SECRET_KEY');

  // Resolve the CSV path against the directory the user invoked pnpm from
  // (pnpm sets INIT_CWD), not against this script's cwd.
  const userCwd = process.env.INIT_CWD ?? process.cwd();
  const absCsvPath = resolve(userCwd, csvPath);
  const csv = readFileSync(absCsvPath, 'utf8');

  const supabase = createSupabaseAdminClient(url, secretKey);

  const { rows, warnings: parseWarnings } = parseKlubfunderCSV(csv);
  console.log(`Parsed ${rows.length} rows from ${absCsvPath}`);
  if (parseWarnings.length > 0) {
    console.log(`Parser warnings (${parseWarnings.length}):`);
    for (const w of parseWarnings) console.log(`  ! ${w}`);
    console.log('');
  }

  console.log('Loading existing principals and members...');
  const existing = await loadExistingState(supabase);
  console.log(
    `Existing state: ${existing.principals.length} principals, ${existing.members.length} members`,
  );
  console.log('');

  const plan = computePlan(rows, existing);
  // Surface parse warnings alongside plan warnings.
  plan.warnings = [...parseWarnings, ...plan.warnings];

  console.log(describePlan(plan));

  if (planIsEmpty(plan)) {
    console.log('');
    console.log('Plan is empty — nothing to apply.');
    return;
  }

  if (!apply) {
    console.log('');
    console.log('Dry run. Re-run with --apply to execute the plan.');
    return;
  }

  console.log('');
  console.log('Applying...');
  const result = await applyPlan(plan, supabase);
  console.log('');
  console.log(describeApplyResult(result));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
