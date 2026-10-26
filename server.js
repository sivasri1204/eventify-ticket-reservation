/**
 * server.js - Eventify REST API Server
 * Built with Express.js, SQLite3, bcryptjs, and jsonwebtoken.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { db, dbRun, dbGet, dbAll, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'eventify-super-secret-key-college-demo-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// -------------------------------------------------------------
// Authentication Helpers & Middleware
// -------------------------------------------------------------
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of the following roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

// -------------------------------------------------------------
// Helper: Release Expired Ticket Holds
// -------------------------------------------------------------
async function cleanExpiredHolds() {
  const now = Date.now();
  await dbRun(
    `UPDATE ticket_holds SET status = 'released' WHERE status = 'active' AND expires_at < ?`,
    [now]
  );
}

// Periodic hold cleanup every 60 seconds
setInterval(cleanExpiredHolds, 60000);

// -------------------------------------------------------------
// AUTH ROUTES
// -------------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const validRole = ['attendee', 'organizer'].includes(role) ? role : 'attendee';

    const existingUser = await dbGet('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const password_hash = bcrypt.hashSync(password, salt);

    const result = await dbRun(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), password_hash, validRole]
    );

    const newUser = {
      id: result.lastID,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role: validRole
    };

    const token = generateToken(newUser);
    res.status(201).json({
      message: 'Account registered successfully!',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register account: ' + err.message });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const userInfo = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = generateToken(userInfo);
    res.json({
      message: 'Login successful!',
      user: userInfo,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed: ' + err.message });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching user profile.' });
  }
});

// -------------------------------------------------------------
// EVENT ROUTES (Public & Protected)
// -------------------------------------------------------------

// GET /api/events (Public list with search & category filter)
app.get('/api/events', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = `
      SELECT 
        e.*,
        u.name as organizer_name,
        MIN(t.price) as min_price,
        MAX(t.price) as max_price,
        SUM(t.available_seats) as total_available_seats,
        SUM(t.total_seats) as total_capacity
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      LEFT JOIN ticket_types t ON e.id = t.event_id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim() !== '') {
      query += ` AND (e.title LIKE ? OR e.description LIKE ? OR e.venue LIKE ?)`;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (category && category !== 'All') {
      query += ` AND e.category = ?`;
      params.push(category);
    }

    query += ` GROUP BY e.id ORDER BY e.date ASC`;

    const events = await dbAll(query, params);

    // Fetch ticket tiers for each event
    for (const evt of events) {
      evt.tickets = await dbAll(
        'SELECT * FROM ticket_types WHERE event_id = ? ORDER BY price ASC',
        [evt.id]
      );
    }

    res.json({ events });
  } catch (err) {
    console.error('Fetch events error:', err);
    res.status(500).json({ error: 'Failed to fetch events: ' + err.message });
  }
});

// GET /api/events/:id (Single event with tickets)
app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await dbGet(
      `SELECT e.*, u.name as organizer_name, u.email as organizer_email 
       FROM events e 
       LEFT JOIN users u ON e.organizer_id = u.id 
       WHERE e.id = ?`,
      [req.params.id]
    );

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    event.tickets = await dbAll(
      'SELECT * FROM ticket_types WHERE event_id = ? ORDER BY price ASC',
      [event.id]
    );

    res.json({ event });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event details.' });
  }
});

// POST /api/events (Protected: Organizer or Admin)
app.post('/api/events', authMiddleware, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      date,
      time,
      venue,
      image_url,
      ga_price,
      ga_seats,
      vip_price,
      vip_seats
    } = req.body;

    if (!title || !description || !category || !date || !time || !venue) {
      return res.status(400).json({ error: 'Please provide all required event details.' });
    }

    const gaPriceNum = parseFloat(ga_price) || 20;
    const gaSeatsNum = parseInt(ga_seats) || 50;
    const vipPriceNum = parseFloat(vip_price) || 50;
    const vipSeatsNum = parseInt(vip_seats) || 20;

    const bannerImage = image_url && image_url.trim() !== ''
      ? image_url.trim()
      : 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80';

    const insertEvent = await dbRun(
      `INSERT INTO events (organizer_id, title, description, category, date, time, venue, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, title.trim(), description.trim(), category, date, time, venue.trim(), bannerImage]
    );

    const eventId = insertEvent.lastID;

    // Insert General Admission ticket type
    await dbRun(
      `INSERT INTO ticket_types (event_id, name, price, total_seats, available_seats, perks)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, 'General Admission', gaPriceNum, gaSeatsNum, gaSeatsNum, 'Standard event entrance & seating']
    );

    // Insert VIP Access ticket type
    await dbRun(
      `INSERT INTO ticket_types (event_id, name, price, total_seats, available_seats, perks)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [eventId, 'VIP Access', vipPriceNum, vipSeatsNum, vipSeatsNum, 'Front-row access, priority check-in, exclusive lounge']
    );

    res.status(201).json({
      message: 'Event created successfully!',
      eventId
    });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event: ' + err.message });
  }
});

// PUT /api/events/:id (Protected: Event Organizer Owner or Admin)
app.put('/api/events/:id', authMiddleware, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Role check: Admin can edit any, Organizer only their own
    if (req.user.role !== 'admin' && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to edit this event.' });
    }

    const {
      title,
      description,
      category,
      date,
      time,
      venue,
      image_url,
      ga_price,
      ga_seats,
      vip_price,
      vip_seats
    } = req.body;

    await dbRun(
      `UPDATE events 
       SET title = ?, description = ?, category = ?, date = ?, time = ?, venue = ?, image_url = ?
       WHERE id = ?`,
      [
        title || event.title,
        description || event.description,
        category || event.category,
        date || event.date,
        time || event.time,
        venue || event.venue,
        image_url || event.image_url,
        eventId
      ]
    );

    // Update tickets if prices/seats provided
    if (ga_price !== undefined || ga_seats !== undefined) {
      const gaTicket = await dbGet("SELECT * FROM ticket_types WHERE event_id = ? AND name = 'General Admission'", [eventId]);
      if (gaTicket) {
        const newPrice = ga_price !== undefined ? parseFloat(ga_price) : gaTicket.price;
        const newTotal = ga_seats !== undefined ? parseInt(ga_seats) : gaTicket.total_seats;
        // Adjust available seats proportionally or keep non-negative
        const sold = gaTicket.total_seats - gaTicket.available_seats;
        const newAvailable = Math.max(0, newTotal - sold);
        await dbRun(
          'UPDATE ticket_types SET price = ?, total_seats = ?, available_seats = ? WHERE id = ?',
          [newPrice, newTotal, newAvailable, gaTicket.id]
        );
      }
    }

    if (vip_price !== undefined || vip_seats !== undefined) {
      const vipTicket = await dbGet("SELECT * FROM ticket_types WHERE event_id = ? AND name = 'VIP Access'", [eventId]);
      if (vipTicket) {
        const newPrice = vip_price !== undefined ? parseFloat(vip_price) : vipTicket.price;
        const newTotal = vip_seats !== undefined ? parseInt(vip_seats) : vipTicket.total_seats;
        const sold = vipTicket.total_seats - vipTicket.available_seats;
        const newAvailable = Math.max(0, newTotal - sold);
        await dbRun(
          'UPDATE ticket_types SET price = ?, total_seats = ?, available_seats = ? WHERE id = ?',
          [newPrice, newTotal, newAvailable, vipTicket.id]
        );
      }
    }

    res.json({ message: 'Event updated successfully!' });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event: ' + err.message });
  }
});

// DELETE /api/events/:id (Protected: Event Organizer Owner or Admin)
app.delete('/api/events/:id', authMiddleware, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await dbGet('SELECT * FROM events WHERE id = ?', [eventId]);

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (req.user.role !== 'admin' && event.organizer_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not authorized to delete this event.' });
    }

    await dbRun('DELETE FROM events WHERE id = ?', [eventId]);
    res.json({ message: 'Event deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete event: ' + err.message });
  }
});

// -------------------------------------------------------------
// TICKET HOLD & CHECKOUT ROUTES (Oversell Prevention & Transactions)
// -------------------------------------------------------------

// POST /api/bookings/hold (Create a 10-minute temporary seat hold)
app.post('/api/bookings/hold', authMiddleware, async (req, res) => {
  try {
    await cleanExpiredHolds();
    const { ticket_type_id, quantity } = req.body;
    const qty = parseInt(quantity);

    if (!ticket_type_id || !qty || qty < 1 || qty > 10) {
      return res.status(400).json({ error: 'Please choose a valid quantity between 1 and 10 tickets.' });
    }

    const ticket = await dbGet(
      `SELECT t.*, e.title as event_title 
       FROM ticket_types t 
       JOIN events e ON t.event_id = e.id 
       WHERE t.id = ?`,
      [ticket_type_id]
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket tier not found.' });
    }

    // Check active holds for this ticket type
    const activeHolds = await dbGet(
      `SELECT COALESCE(SUM(quantity), 0) as held_count 
       FROM ticket_holds 
       WHERE ticket_type_id = ? AND status = 'active' AND expires_at > ?`,
      [ticket_type_id, Date.now()]
    );

    const effectivelyAvailable = ticket.available_seats - activeHolds.held_count;

    if (effectivelyAvailable < qty) {
      return res.status(400).json({
        error: `Only ${Math.max(0, effectivelyAvailable)} seat(s) currently available. Some seats are in checkout.`
      });
    }

    const holdToken = 'HOLD-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const holdDurationMs = 10 * 60 * 1000; // 10 minutes
    const expiresAt = Date.now() + holdDurationMs;

    await dbRun(
      `INSERT INTO ticket_holds (hold_token, ticket_type_id, user_id, quantity, expires_at, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [holdToken, ticket_type_id, req.user.id, qty, expiresAt]
    );

    const totalPrice = ticket.price * qty;

    res.json({
      message: 'Seats reserved for 10 minutes!',
      holdToken,
      expiresAt,
      ticket: {
        id: ticket.id,
        name: ticket.name,
        price: ticket.price,
        eventTitle: ticket.event_title
      },
      quantity: qty,
      totalPrice
    });
  } catch (err) {
    console.error('Hold error:', err);
    res.status(500).json({ error: 'Failed to reserve seats: ' + err.message });
  }
});

// DELETE /api/bookings/hold/:holdToken (Release temporary hold)
app.delete('/api/bookings/hold/:holdToken', authMiddleware, async (req, res) => {
  try {
    await dbRun(
      `UPDATE ticket_holds SET status = 'released' WHERE hold_token = ? AND user_id = ?`,
      [req.params.holdToken, req.user.id]
    );
    res.json({ message: 'Seat hold released.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to release hold.' });
  }
});

// POST /api/bookings/checkout (Execute payment & finalize ticket booking atomically)
app.post('/api/bookings/checkout', authMiddleware, async (req, res) => {
  const {
    holdToken,
    ticket_type_id,
    quantity,
    attendee_name,
    attendee_email,
    simulate_failure
  } = req.body;

  const qty = parseInt(quantity);

  if (!ticket_type_id || !qty || !attendee_name || !attendee_email) {
    return res.status(400).json({ error: 'Missing required booking information.' });
  }

  // Check Mock Payment Failure Simulation
  if (simulate_failure === true) {
    return res.status(402).json({
      error: 'Mock Payment Declined: Simulated transaction failure (e.g. insufficient funds / bank decline). Your hold is still active — you may retry payment.'
    });
  }

  try {
    await cleanExpiredHolds();

    // Use SQLite transaction to guarantee atomic seat deduction and booking insertion
    await dbRun('BEGIN TRANSACTION');

    const ticket = await dbGet(
      `SELECT t.*, e.id as event_id, e.title as event_title, e.date as event_date, e.venue as event_venue 
       FROM ticket_types t 
       JOIN events e ON t.event_id = e.id 
       WHERE t.id = ?`,
      [ticket_type_id]
    );

    if (!ticket) {
      await dbRun('ROLLBACK');
      return res.status(404).json({ error: 'Selected ticket type does not exist.' });
    }

    if (ticket.available_seats < qty) {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Sorry, not enough available seats remaining for this event.' });
    }

    // Atomically decrement seats with guard condition
    const updateSeats = await dbRun(
      `UPDATE ticket_types SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?`,
      [qty, ticket_type_id, qty]
    );

    if (updateSeats.changes === 0) {
      await dbRun('ROLLBACK');
      return res.status(400).json({ error: 'Seats were taken just now. Booking could not be completed.' });
    }

    // Generate unique human-readable booking code & payment reference
    const bookingCode = 'EVT-' + Math.floor(100000 + Math.random() * 900000);
    const paymentRef = 'PAY-MOCK-' + Math.floor(10000000 + Math.random() * 90000000);
    const totalPrice = ticket.price * qty;

    const bookingInsert = await dbRun(
      `INSERT INTO bookings 
        (booking_code, user_id, event_id, ticket_type_id, quantity, unit_price, total_price, attendee_name, attendee_email, payment_status, payment_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [
        bookingCode,
        req.user.id,
        ticket.event_id,
        ticket_type_id,
        qty,
        ticket.price,
        totalPrice,
        attendee_name.trim(),
        attendee_email.toLowerCase().trim(),
        paymentRef
      ]
    );

    // If hold token was provided, convert it
    if (holdToken) {
      await dbRun(
        `UPDATE ticket_holds SET status = 'converted' WHERE hold_token = ?`,
        [holdToken]
      );
    }

    await dbRun('COMMIT');

    res.status(201).json({
      message: 'Booking confirmed successfully!',
      booking: {
        id: bookingInsert.lastID,
        booking_code: bookingCode,
        event_title: ticket.event_title,
        event_date: ticket.event_date,
        event_venue: ticket.event_venue,
        ticket_name: ticket.name,
        quantity: qty,
        unit_price: ticket.price,
        total_price: totalPrice,
        attendee_name,
        attendee_email,
        payment_reference: paymentRef,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    await dbRun('ROLLBACK');
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Checkout failed due to transaction error: ' + err.message });
  }
});

// GET /api/bookings/my (Attendee's booking history)
app.get('/api/bookings/my', authMiddleware, async (req, res) => {
  try {
    const bookings = await dbAll(
      `SELECT 
        b.*,
        e.title as event_title,
        e.date as event_date,
        e.time as event_time,
        e.venue as event_venue,
        e.image_url as event_image,
        t.name as ticket_name,
        t.perks as ticket_perks
       FROM bookings b
       JOIN events e ON b.event_id = e.id
       JOIN ticket_types t ON b.ticket_type_id = t.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [req.user.id]
    );

    res.json({ bookings });
  } catch (err) {
    console.error('Fetch bookings error:', err);
    res.status(500).json({ error: 'Failed to fetch your bookings.' });
  }
});

// DELETE /api/bookings/:id (Cancel booking & restore ticket seats)
app.delete('/api/bookings/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await dbGet('SELECT * FROM bookings WHERE id = ?', [req.params.id]);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Role check: Admin or the Attendee who booked it
    if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to cancel this booking.' });
    }

    await dbRun('BEGIN TRANSACTION');

    // Restore available seats
    await dbRun(
      'UPDATE ticket_types SET available_seats = available_seats + ? WHERE id = ?',
      [booking.quantity, booking.ticket_type_id]
    );

    // Delete booking
    await dbRun('DELETE FROM bookings WHERE id = ?', [booking.id]);

    await dbRun('COMMIT');

    res.json({ message: 'Booking canceled successfully and seats returned to inventory.' });
  } catch (err) {
    await dbRun('ROLLBACK');
    res.status(500).json({ error: 'Failed to cancel booking: ' + err.message });
  }
});

// -------------------------------------------------------------
// ORGANIZER DASHBOARD ROUTES
// -------------------------------------------------------------

// GET /api/organizer/stats (Organizer's own events, bookings, revenue)
app.get('/api/organizer/stats', authMiddleware, requireRole('organizer', 'admin'), async (req, res) => {
  try {
    // If admin is viewing organizer dashboard, can optionally see all or their own
    const organizerId = req.user.id;

    // Organizer's events with sales aggregation
    const events = await dbAll(
      `SELECT 
        e.*,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(b.quantity), 0) as tickets_sold,
        COALESCE(SUM(b.total_price), 0) as gross_revenue
       FROM events e
       LEFT JOIN bookings b ON e.id = b.event_id
       WHERE e.organizer_id = ?
       GROUP BY e.id
       ORDER BY e.created_at DESC`,
      [organizerId]
    );

    // Fetch ticket tiers for each event
    for (const evt of events) {
      evt.tickets = await dbAll(
        'SELECT * FROM ticket_types WHERE event_id = ?',
        [evt.id]
      );
    }

    // Total metrics
    const statsSummary = await dbGet(
      `SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(b.quantity), 0) as total_tickets_sold,
        COALESCE(SUM(b.total_price), 0) as total_revenue
       FROM events e
       LEFT JOIN bookings b ON e.id = b.event_id
       WHERE e.organizer_id = ?`,
      [organizerId]
    );

    // Recent attendees for organizer's events
    const recentAttendees = await dbAll(
      `SELECT 
        b.id,
        b.booking_code,
        b.attendee_name,
        b.attendee_email,
        b.quantity,
        b.total_price,
        b.created_at,
        e.title as event_title,
        t.name as ticket_name
       FROM bookings b
       JOIN events e ON b.event_id = e.id
       JOIN ticket_types t ON b.ticket_type_id = t.id
       WHERE e.organizer_id = ?
       ORDER BY b.created_at DESC
       LIMIT 10`,
      [organizerId]
    );

    res.json({
      summary: {
        total_events: statsSummary.total_events || 0,
        total_bookings: statsSummary.total_bookings || 0,
        total_tickets_sold: statsSummary.total_tickets_sold || 0,
        total_revenue: statsSummary.total_revenue || 0
      },
      events,
      recentAttendees
    });
  } catch (err) {
    console.error('Organizer stats error:', err);
    res.status(500).json({ error: 'Failed to fetch organizer statistics.' });
  }
});

// -------------------------------------------------------------
// ADMIN DASHBOARD ROUTES
// -------------------------------------------------------------

// GET /api/admin/stats (Platform-wide metrics, all users, all events)
app.get('/api/admin/stats', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const userStats = await dbGet(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'attendee' THEN 1 ELSE 0 END) as attendee_count,
        SUM(CASE WHEN role = 'organizer' THEN 1 ELSE 0 END) as organizer_count,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count
      FROM users
    `);

    const platformStats = await dbGet(`
      SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(DISTINCT b.id) as total_bookings,
        COALESCE(SUM(b.quantity), 0) as total_tickets_sold,
        COALESCE(SUM(b.total_price), 0) as total_revenue
      FROM events e
      LEFT JOIN bookings b ON e.id = b.event_id
    `);

    const users = await dbAll(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );

    const allEvents = await dbAll(`
      SELECT 
        e.*,
        u.name as organizer_name,
        u.email as organizer_email,
        COUNT(b.id) as booking_count,
        COALESCE(SUM(b.total_price), 0) as event_revenue
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      LEFT JOIN bookings b ON e.id = b.event_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `);

    res.json({
      summary: {
        total_users: userStats.total_users || 0,
        attendee_count: userStats.attendee_count || 0,
        organizer_count: userStats.organizer_count || 0,
        admin_count: userStats.admin_count || 0,
        total_events: platformStats.total_events || 0,
        total_bookings: platformStats.total_bookings || 0,
        total_tickets_sold: platformStats.total_tickets_sold || 0,
        total_revenue: platformStats.total_revenue || 0
      },
      users,
      events: allEvents
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch admin stats: ' + err.message });
  }
});

// DELETE /api/admin/users/:id (Admin delete user)
app.delete('/api/admin/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);

    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await dbRun('DELETE FROM users WHERE id = ?', [targetUserId]);
    res.json({ message: `User "${user.name}" deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// -------------------------------------------------------------
// Server Initialization
// -------------------------------------------------------------
async function startServer(port = PORT) {
  try {
    await initDatabase();
    return new Promise((resolve) => {
      const s = app.listen(port, () => {
        console.log(`=======================================================`);
        console.log(`🎟️  Eventify Server running at: http://localhost:${port}`);
        console.log(`⚡ Multi-Tenant Event & Ticket Reservation System`);
        console.log(`=======================================================`);
        resolve(s);
      });
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
