const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  // Connection pooling is managed via DATABASE_URL parameters:
  // Append ?connection_limit=10&pool_timeout=30 to your DATABASE_URL in .env
  // Example: mysql://user:pass@host:3306/db?connection_limit=10&pool_timeout=30
});

module.exports = prisma;
