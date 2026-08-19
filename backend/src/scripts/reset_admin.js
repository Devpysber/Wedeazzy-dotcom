const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'wedeazzy@gmail.com';
  const password   = process.env.ADMIN_PASSWORD || 'Psyber999@';

  const salt         = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await prisma.user.upsert({
    where:  { email: adminEmail },
    update: { passwordHash, role: 'admin', verifiedAt: new Date(), suspendedAt: null },
    create: { email: adminEmail, role: 'admin', name: 'WedEazzy Administrator', passwordHash, verifiedAt: new Date() },
  });

  console.log(`✅ Admin ready: ${user.email} (ID: ${user.id})`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });