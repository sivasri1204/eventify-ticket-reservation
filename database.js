/**
 * database.js - Eventify Database Configuration & Initialization
 * Uses SQLite3 with parameterized queries and promise-based helper functions.
 * Automatically creates tables and seeds demo data on initial launch.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'eventify.db');

// Connect to SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Error opening SQLite database:', err.message);
  } else {
    console.log('✅ Connected to SQLite database:', DB_PATH);
  }
});

// Enable SQLite foreign key constraints
db.run('PRAGMA foreign_keys = ON;');

/**
 * Promise-wrapped db.run for INSERT, UPDATE, DELETE queries
 * Returns { lastID, changes }
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Promise-wrapped db.get for single-row SELECT queries
 * Returns the matching row object or undefined
 */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

/**
 * Promise-wrapped db.all for multi-row SELECT queries
 * Returns an array of matching row objects
 */
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Initialize database schema and seed initial sample data
 */
async function initDatabase() {
  // 1. Users Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'organizer', 'attendee')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Events Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organizer_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      venue TEXT NOT NULL,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. Ticket Types Table (General Admission & VIP)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS ticket_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      total_seats INTEGER NOT NULL,
      available_seats INTEGER NOT NULL,
      perks TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );
  `);

  // 4. Ticket Holds Table (10-minute temporary seat reservation)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS ticket_holds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hold_token TEXT UNIQUE NOT NULL,
      ticket_type_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 5. Bookings Table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      event_id INTEGER NOT NULL,
      ticket_type_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      attendee_name TEXT NOT NULL,
      attendee_email TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'completed',
      payment_reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE
    );
  `);

  // Seed sample data if database is fresh
  const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('🌱 Seeding initial demo data...');
    await seedDemoData();
    console.log('✅ Demo data seeded successfully!');
  } else {
    console.log('ℹ️ Database already initialized with existing data.');
  }
}

/**
 * Seed initial users, events, ticket types, and sample bookings
 */
async function seedDemoData() {
  const salt = bcrypt.genSaltSync(10);
  const adminPass = bcrypt.hashSync('admin123', salt);
  const organizerPass = bcrypt.hashSync('organizer123', salt);
  const attendeePass = bcrypt.hashSync('attendee123', salt);

  // 1. Seed Users (1 Admin, 2 Organizers, 2 Attendees)
  const userAdmin = await dbRun(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    ['Platform Admin', 'admin@eventify.com', adminPass, 'admin']
  );

  const userOrg1 = await dbRun(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    ['Sarah Jenkins (Nexus Events)', 'sarah@nexusevents.com', organizerPass, 'organizer']
  );

  const userOrg2 = await dbRun(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    ['Marcus Vance (Pulse Productions)', 'marcus@pulseproductions.com', organizerPass, 'organizer']
  );

  const userAtt1 = await dbRun(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    ['Alex Rivera', 'alex.attendee@gmail.com', attendeePass, 'attendee']
  );

  const userAtt2 = await dbRun(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
    ['Elena Rostova', 'elena.r@gmail.com', attendeePass, 'attendee']
  );

  // 2. Seed 6 Rich Events
  const eventsData = [
    {
      organizer_id: userOrg1.lastID,
      title: 'National Cloud & Technology Summit 2026',
      description: 'Join engineers, software developers, and cloud architects for two days of technical talks, system design sessions, and hands-on workshops on distributed systems, DevOps, and scalable web engineering.',
      category: 'Tech',
      date: '2026-11-14',
      time: '09:00 AM',
      venue: 'Metropolis Convention Center, Hall A (Bengaluru, KA)',
      image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 1499.00, total: 150, available: 142, perks: 'Full stage access, lunch voucher, digital certificate' },
        { name: 'VIP Access', price: 4999.00, total: 40, available: 37, perks: 'Front-row seating, VIP lounge buffet, 1-on-1 speaker mixer' }
      ]
    },
    {
      organizer_id: userOrg2.lastID,
      title: 'Neon Odyssey: Electronic Music & Lights Festival',
      description: 'An unforgettable night under neon laser canopies featuring world-class synthwave, melodic bass, and house DJs, accompanied by synchronized 3D drone choreography.',
      category: 'Music',
      date: '2026-11-21',
      time: '07:30 PM',
      venue: 'Skyline Waterfront Arena (Mumbai, MH)',
      image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 999.00, total: 300, available: 285, perks: 'Entry to main grounds, LED wristband' },
        { name: 'VIP Access', price: 2499.00, total: 60, available: 55, perks: 'Express security lane, elevated viewing deck, 2 drink tokens' }
      ]
    },
    {
      organizer_id: userOrg1.lastID,
      title: 'Full-Stack Modern Web & DevOps Masterclass',
      description: 'Level up your engineering skills. Build real-time microservices, deploy resilient Docker containers, and master serverless architectures in an intensive hands-on lab.',
      category: 'Workshop',
      date: '2026-11-28',
      time: '10:00 AM',
      venue: 'TechHub Innovation Lab, Hitech City (Hyderabad, TS)',
      image_url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 499.00, total: 50, available: 45, perks: 'Interactive workshop seat, GitHub repo source code, cloud sandbox credits' },
        { name: 'VIP Access', price: 1299.00, total: 15, available: 12, perks: '1-hour resume review with Senior Lead Engineer, premium swag bag' }
      ]
    },
    {
      organizer_id: userOrg2.lastID,
      title: 'City Lights 10K Twilight Run & Health Expo',
      description: 'Lace up your running shoes for an evening charity race through scenic riverside bridges followed by live acoustic bands, healthy smoothie bars, and wellness booths.',
      category: 'Sports',
      date: '2026-12-05',
      time: '05:00 PM',
      venue: 'Bayside Marina Promenade (Chennai, TN)',
      image_url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 399.00, total: 200, available: 188, perks: 'Official race bib, finisher medal, isotonic hydration packs' },
        { name: 'VIP Access', price: 899.00, total: 30, available: 27, perks: 'Premium moisture-wicking runner jersey, gear storage tent, recovery massage' }
      ]
    },
    {
      organizer_id: userOrg1.lastID,
      title: 'Laugh Out Loud: Comedy All-Stars Live',
      description: 'Prepare your abs for an evening of gut-busting humor featuring five top touring stand-up comedians fresh off specials and viral comedy clips.',
      category: 'Comedy',
      date: '2026-12-12',
      time: '08:00 PM',
      venue: 'The Royale Auditorium, Connaught Place (New Delhi, DL)',
      image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 599.00, total: 120, available: 110, perks: 'Standard cabaret table seating, complimentary popcorn' },
        { name: 'VIP Access', price: 1499.00, total: 25, available: 22, perks: 'Front table right near stage, artist meet-and-greet photo op' }
      ]
    },
    {
      organizer_id: userOrg2.lastID,
      title: 'Founder Pitch Night & Angel Investor Mixer',
      description: 'Where visionary founders meet active angel syndicates and venture capitalists. Eight curated pre-seed and seed startups pitch live on stage followed by open networking.',
      category: 'Networking',
      date: '2026-12-18',
      time: '06:00 PM',
      venue: 'WeWork Galaxy, Residency Road (Bengaluru, KA)',
      image_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1000&q=80',
      tickets: [
        { name: 'General Admission', price: 799.00, total: 80, available: 74, perks: 'Pitch showcase attendance, networking directory, complimentary hors d’oeuvres' },
        { name: 'VIP Access', price: 2199.00, total: 20, available: 18, perks: 'Private investor dinner lounge, startup deck lookbook, founder direct intros' }
      ]
    }
  ];

  let sampleBookingTickets = [];

  for (const item of eventsData) {
    const res = await dbRun(
      `INSERT INTO events (organizer_id, title, description, category, date, time, venue, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.organizer_id, item.title, item.description, item.category, item.date, item.time, item.venue, item.image_url]
    );
    const eventId = res.lastID;

    for (const ticket of item.tickets) {
      const ticketRes = await dbRun(
        `INSERT INTO ticket_types (event_id, name, price, total_seats, available_seats, perks)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, ticket.name, ticket.price, ticket.total, ticket.available, ticket.perks]
      );
      sampleBookingTickets.push({
        eventId,
        ticketTypeId: ticketRes.lastID,
        name: ticket.name,
        price: ticket.price,
        eventTitle: item.title
      });
    }
  }

  // 3. Seed Sample Bookings for Alex Rivera so "My Bookings" has immediate demonstration data
  if (sampleBookingTickets.length >= 2) {
    // Booking 1: AI summit GA
    await dbRun(
      `INSERT INTO bookings (booking_code, user_id, event_id, ticket_type_id, quantity, unit_price, total_price, attendee_name, attendee_email, payment_status, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'EVT-882194',
        userAtt1.lastID,
        sampleBookingTickets[0].eventId,
        sampleBookingTickets[0].ticketTypeId,
        2,
        sampleBookingTickets[0].price,
        sampleBookingTickets[0].price * 2,
        'Alex Rivera',
        'alex.attendee@gmail.com',
        'completed',
        'PAY-MOCK-991204'
      ]
    );

    // Booking 2: Neon Odyssey VIP
    await dbRun(
      `INSERT INTO bookings (booking_code, user_id, event_id, ticket_type_id, quantity, unit_price, total_price, attendee_name, attendee_email, payment_status, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'EVT-349182',
        userAtt1.lastID,
        sampleBookingTickets[3].eventId,
        sampleBookingTickets[3].ticketTypeId,
        1,
        sampleBookingTickets[3].price,
        sampleBookingTickets[3].price,
        'Alex Rivera',
        'alex.attendee@gmail.com',
        'completed',
        'PAY-MOCK-774128'
      ]
    );
  }
}

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};
