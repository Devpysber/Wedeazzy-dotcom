#!/usr/bin/env node
/**
 * WedEazzy - Emergency Schema Fix Script
 * 
 * Run this directly on the production server to apply all missing
 * database columns and tables that caused the HTTP 500 on signup.
 * 
 * Usage (on the Hostinger server):
 *   cd /path/to/backend
 *   node src/scripts/fix-schema.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { execSync } = require('child_process');

const logger = require('../config/logger');

async function main() {
  logger.info('=== WedEazzy Emergency Schema Fix ===');
  logger.info('Running: npx prisma migrate deploy');
  
  try {
    const output = execSync('npx prisma migrate deploy', {
      cwd: require('path').resolve(__dirname, '../..'),
      env: { ...process.env },
      stdio: 'pipe',
      encoding: 'utf8'
    });
    logger.info({ output }, 'Migration completed successfully');
    console.log(output);
  } catch (err) {
    logger.error({ err: err.message, stderr: err.stderr, stdout: err.stdout }, 'Migration failed');
    console.error('MIGRATION FAILED:', err.message);
    console.error('STDERR:', err.stderr);
    console.error('STDOUT:', err.stdout);
    process.exit(1);
  }
  
  // Regenerate Prisma client
  logger.info('Running: npx prisma generate');
  try {
    const output = execSync('npx prisma generate', {
      cwd: require('path').resolve(__dirname, '../..'),
      env: { ...process.env },
      stdio: 'pipe',
      encoding: 'utf8'
    });
    logger.info('Prisma client regenerated successfully');
    console.log(output);
  } catch (err) {
    logger.error({ err: err.message }, 'Prisma generate failed');
    console.error('PRISMA GENERATE FAILED:', err.message);
    process.exit(1);
  }
  
  // Test DB connection
  const prisma = require('../config/db');
  logger.info('Testing DB connection...');
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('DB connection OK');
  } catch (err) {
    logger.error({ err: err.message }, 'DB connection FAILED');
    process.exit(1);
  }
  
  // Verify critical tables exist
  const tables = ['User', 'Session', 'OtpCode', 'Vendor', 'Couple', 'user_otps', 'password_reset_tokens', 'jwt_denylist'];
  logger.info('Verifying tables...');
  for (const table of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as count FROM \`${table}\` LIMIT 1`);
      logger.info(`  ✓ Table '${table}' exists`);
    } catch (err) {
      logger.error(`  ✗ Table '${table}' MISSING: ${err.message}`);
    }
  }
  
  // Verify critical columns on User table
  logger.info('Verifying User table columns...');
  try {
    const cols = await prisma.$queryRaw`SHOW COLUMNS FROM User`;
    const colNames = cols.map(c => c.Field);
    const required = ['passwordHash', 'googleId', 'auth_provider', 'revoked_before', 'suspended_at', 'image_url', 'last_login'];
    for (const col of required) {
      if (colNames.includes(col)) {
        logger.info(`  ✓ Column User.${col} exists`);
      } else {
        logger.error(`  ✗ Column User.${col} MISSING`);
      }
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to verify User columns');
  }
  
  logger.info('=== Fix complete. Restart PM2: pm2 restart wedeazzy-api ===');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
