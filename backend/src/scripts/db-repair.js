/**
 * Non-destructive database schema repair.
 *
 * Recovers from the two states that leave the API returning 500s on every
 * query while the process itself looks healthy:
 *
 *   P3009 — a migration is recorded as failed, so `migrate deploy` refuses to
 *           apply anything ever again ("migrate found failed migrations in the
 *           target database").
 *   Drift — tables exist but were created from an older schema, so columns the
 *           Prisma Client expects are missing ("The column `Vendor.state` does
 *           not exist in the current database").
 *
 * Both happen when a database that already had tables meets a fresh migration
 * history: the first `CREATE TABLE` hits an existing table, the migration
 * aborts half-applied, and Prisma locks the history.
 *
 * Strategy — additive, in this order:
 *   1. Mark any failed migration as rolled back, unlocking the history.
 *   2. `db push` the schema onto the live database. This ALTERs existing
 *      tables to add the missing columns rather than recreating them, so
 *      existing rows survive.
 *   3. Baseline the migration as applied, so the normal boot-time
 *      `migrate deploy` becomes a clean no-op from here on.
 *
 * By default this refuses any change Prisma flags as data-losing. Pass
 * --accept-data-loss only when you have decided the columns/tables Prisma
 * wants to drop are genuinely disposable.
 *
 *   node src/scripts/db-repair.js
 *   node src/scripts/db-repair.js --accept-data-loss
 *
 * Safe to run repeatedly — every step is idempotent.
 */

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = 'prisma/schema.prisma';
const MIGRATIONS_DIR = path.join(BACKEND_ROOT, 'prisma', 'migrations');

// Bare `node` is not on the shell PATH under Hostinger's Passenger
// environment, so always invoke the interpreter running this script.
const NODE_BIN = process.execPath;
const PRISMA_CLI = path.join(BACKEND_ROOT, 'node_modules', 'prisma', 'build', 'index.js');

const acceptDataLoss = process.argv.includes('--accept-data-loss');

function log(msg) { console.log(`[db-repair] ${msg}`); }

/** Run the local Prisma CLI. Returns { ok, output } instead of throwing. */
function prisma(args, { quiet = false } = {}) {
  try {
    const output = execFileSync(NODE_BIN, [PRISMA_CLI, ...args], {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (!quiet) process.stdout.write(output);
    return { ok: true, output };
  } catch (err) {
    const output = `${err.stdout || ''}${err.stderr || ''}`;
    return { ok: false, output };
  }
}

/** Migration directory names, oldest first — the same order Prisma applies. */
function migrationNames() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function main() {
  if (!fs.existsSync(PRISMA_CLI)) {
    console.error('[db-repair] Prisma CLI not found. Run `npm install` in the backend folder first.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('[db-repair] DATABASE_URL is not set. Fill it in backend/.env before running this.');
    process.exit(1);
  }

  const names = migrationNames();
  if (names.length === 0) {
    console.error('[db-repair] No migrations found in prisma/migrations. Nothing to repair.');
    process.exit(1);
  }

  // --- 1. Unlock a failed migration history -------------------------------
  // `migrate resolve --rolled-back` is rejected for migrations that are not in
  // the failed state, so failures here are expected and ignored.
  log('Step 1/3 — clearing any failed migration records...');
  let unlocked = 0;
  for (const name of names) {
    const res = prisma(['migrate', 'resolve', '--rolled-back', name, `--schema=${SCHEMA}`], { quiet: true });
    if (res.ok) {
      log(`  cleared failed migration: ${name}`);
      unlocked += 1;
    }
  }
  log(unlocked === 0 ? '  no failed migrations recorded.' : `  ${unlocked} migration record(s) cleared.`);

  // --- 2. Bring the live schema up to date --------------------------------
  log('Step 2/3 — syncing the database schema (adds missing columns in place)...');
  const pushArgs = ['db', 'push', `--schema=${SCHEMA}`, '--skip-generate'];
  if (acceptDataLoss) pushArgs.push('--accept-data-loss');

  const push = prisma(pushArgs);
  if (!push.ok) {
    // Prisma's own wording varies by version; match on the flag it names.
    if (!acceptDataLoss && /accept-data-loss|data loss/i.test(push.output)) {
      console.error(push.output);
      console.error(
        '\n[db-repair] STOPPED. Prisma reports this sync would drop one or more\n' +
        '            columns or tables that exist in the database but not in\n' +
        '            schema.prisma. Nothing has been changed.\n\n' +
        '            Read the list above. If everything it wants to drop is\n' +
        '            genuinely disposable, re-run:\n\n' +
        '              node src/scripts/db-repair.js --accept-data-loss\n'
      );
      process.exit(2);
    }
    console.error(push.output);
    console.error('\n[db-repair] Schema sync failed. Nothing was baselined; the database is unchanged by this step.');
    process.exit(1);
  }
  log('  schema is in sync.');

  // --- 3. Baseline so the boot-time migrate deploy is a no-op -------------
  // The schema now matches, but the migration history does not know that.
  // Without this, `migrate deploy` on the next boot tries to CREATE TABLE
  // against tables that already exist and fails right back into P3009.
  log('Step 3/3 — baselining migration history...');
  for (const name of names) {
    const res = prisma(['migrate', 'resolve', '--applied', name, `--schema=${SCHEMA}`], { quiet: true });
    log(res.ok ? `  marked applied: ${name}` : `  already applied: ${name}`);
  }

  log('');
  log('Repair complete. Restart the Node app, then check /health — "schema" should read "ok".');
}

main();
