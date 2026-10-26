const { db, dbRun, dbGet, seedDemoData, initDatabase } = require('./database');

async function reset() {
  console.log('🔄 Resetting and re-seeding database with Indian Rupees (₹)...');
  await dbRun('PRAGMA foreign_keys = OFF;');
  await dbRun('DROP TABLE IF EXISTS bookings;');
  await dbRun('DROP TABLE IF EXISTS ticket_holds;');
  await dbRun('DROP TABLE IF EXISTS ticket_types;');
  await dbRun('DROP TABLE IF EXISTS events;');
  await dbRun('DROP TABLE IF EXISTS users;');
  await dbRun('PRAGMA foreign_keys = ON;');
  
  await initDatabase();
  const events = await (require('./database').dbAll('SELECT id, title FROM events'));
  console.log('✅ Successfully re-seeded events:', events.length);
  process.exit(0);
}

reset().catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
