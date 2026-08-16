const prisma = require('../config/db');

async function main() {
  try {
    console.log('Attempting to connect to database using config/db...');
    const usersCount = await prisma.user.count();
    const vendorsCount = await prisma.vendor.count();
    const couplesCount = await prisma.couple.count();
    const inquiriesCount = await prisma.inquiry.count();
    const transactionsCount = await prisma.transaction.count();
    const waMessagesCount = await prisma.waMessage.count();
    
    console.log('Database Statistics:');
    console.log('- Users:', usersCount);
    console.log('- Vendors:', vendorsCount);
    console.log('- Couples:', couplesCount);
    console.log('- Inquiries:', inquiriesCount);
    console.log('- Transactions:', transactionsCount);
    console.log('- WhatsApp Messages:', waMessagesCount);
  } catch (e) {
    console.error('Connection failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

