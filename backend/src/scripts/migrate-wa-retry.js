/**
 * One-time migration script: add retryCount + nextRetryAt to WaMessage table.
 * Run once: node scripts/migrate-wa-retry.js
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('[migrate-wa-retry] Applying WaMessage retry fields...');

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WaMessage ADD COLUMN retryCount INT NOT NULL DEFAULT 0'
    );
    console.log('[migrate-wa-retry] Added column: retryCount');
  } catch (e) {
    if (e.message.includes('Duplicate column')) {
      console.log('[migrate-wa-retry] retryCount already exists — skipping');
    } else {
      throw e;
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE WaMessage ADD COLUMN nextRetryAt DATETIME(3) NULL'
    );
    console.log('[migrate-wa-retry] Added column: nextRetryAt');
  } catch (e) {
    if (e.message.includes('Duplicate column')) {
      console.log('[migrate-wa-retry] nextRetryAt already exists — skipping');
    } else {
      throw e;
    }
  }

  try {
    await prisma.$executeRawUnsafe(
      'CREATE INDEX WaMessage_status_nextRetryAt_idx ON WaMessage(status, nextRetryAt)'
    );
    console.log('[migrate-wa-retry] Added index: WaMessage_status_nextRetryAt_idx');
  } catch (e) {
    if (e.message.includes('Duplicate key name') || e.message.includes('already exists')) {
      console.log('[migrate-wa-retry] Index already exists — skipping');
    } else {
      throw e;
    }
  }

  // Also update Prisma client to regenerate with new schema
  console.log('[migrate-wa-retry] Migration complete ✓');
}

run()
  .catch((e) => {
    console.error('[migrate-wa-retry] FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
