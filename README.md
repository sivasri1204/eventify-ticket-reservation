# Eventify - Multi-Tenant Event and Ticket Reservation System

A Web Technology mini project developed using Node.js, Express.js, SQLite, and vanilla HTML, CSS, and JavaScript.

---

## 1. Project Overview

Eventify is a web-based event discovery and ticket reservation system designed to simulate real-world ticketing platforms such as BookMyShow and Eventbrite. The application is built with a multi-tenant role-based access model, allowing multiple organizers to publish and manage events while attendees can browse, reserve seats, and complete mock payments.

The project addresses two critical challenges in web-based reservation systems:
1. **Preventing Overselling:** Utilizing atomic database transactions with conditional updates so two users cannot book the last available seat simultaneously.
2. **Fair Ticket Holds:** Temporarily reserving selected seats for 10 minutes during the checkout phase so tickets are not taken while an attendee is entering payment details.

All ticket pricing, transactions, and revenue tracking are implemented in Indian Rupees (INR, Rs. / INR symbol).

---

## 2. Technology Stack

### Frontend
- **HTML5:** Semantic document structure for event catalogs, dashboards, and booking modals.
- **CSS3:** Custom responsive layout, dark theme styling with violet accents, CSS grid and flexbox, print-specific stylesheet (`@media print`) for digital ticket generation. No heavy UI framework used.
- **JavaScript (ES6):** Client-side routing, DOM updates, countdown timer implementation, and asynchronous fetch requests to backend APIs.

### Backend
- **Node.js:** Server-side runtime environment.
- **Express.js:** Lightweight web application framework handling routing, static file serving, and middleware processing.
- **SQLite3:** Serverless, file-based relational database (`eventify.db`) executing parameterized SQL queries.

### Authentication and Security
- **bcryptjs:** Salted password hashing (10 salt rounds) before storing credentials in the database.
- **jsonwebtoken (JWT):** Token-based session authentication passed via the HTTP Authorization header (`Bearer <token>`).

---

## 3. System Architecture and Workflow

```
[ Browser Client ]
  |-- Single Page Application (HTML / CSS / JavaScript)
  |-- Local Token & Session State
         |
         | HTTP REST Requests (JSON)
         v
[ Express Server ]
  |-- JWT Authentication Middleware
  |-- Role-Based Route Guards (Admin / Organizer / Attendee)
  |-- 10-Minute Seat Hold Scheduler
  |-- SQLite Transaction Controller
         |
         | Parameterized SQL Queries
         v
[ SQLite Database: eventify.db ]
  |-- users
  |-- events
  |-- ticket_types
  |-- ticket_holds
  |-- bookings
```

---

## 4. Key Modules and User Roles

The system enforces role-based access control across three user roles:

### Attendee Module
- Browse published events by category (Tech, Music, Workshop, Sports, Comedy, Networking).
- Search events in real time by title, description, or city.
- Select ticket tiers (General Admission vs. VIP) and choose quantities up to 10 tickets per order.
- Initiate a 10-minute temporary seat hold with a live countdown display.
- Complete checkout using a simulated Indian payment interface (UPI ID or RuPay/Debit card).
- Test payment success and simulated payment decline scenarios.
- View booking history, cancel orders (which restores seats to the pool), and view/print digital boarding passes.

### Organizer Module
- Dedicated dashboard showing only the events published by that specific organizer.
- Summary metrics: Active Events Count, Total Tickets Sold, Total Bookings, and Gross Revenue (INR).
- Complete CRUD operations: Create new events, edit dates/venues/pricing, and delete events.
- Real-time attendee roster showing booking codes, attendee names, emails, and transaction amounts.

### Administrator Module
- Platform-wide overview showing total registered users, total events, tickets reserved, and platform gross revenue.
- User management table with the ability to delete user accounts.
- Event moderation table allowing administrators to audit and remove any event across the platform.

---

## 5. Technical Highlights and Implementation Details

### Concurrency and Race Condition Prevention
To prevent overselling when multiple users attempt to reserve the same seats simultaneously, the checkout process executes within an atomic SQLite transaction:

```sql
BEGIN TRANSACTION;
UPDATE ticket_types 
SET available_seats = available_seats - ? 
WHERE id = ? AND available_seats >= ?;
-- If changes == 0, ROLLBACK is issued; otherwise COMMIT
```

If the remaining seats are fewer than the requested quantity, the query affects 0 rows, prompting the server to roll back the transaction and return an HTTP 400 error.

### 10-Minute Fair Hold Engine
When an attendee clicks "Reserve & Proceed to Payment":
1. A temporary hold record is inserted into `ticket_holds` with `expires_at = Date.now() + 600000` (10 minutes).
2. Available seats are evaluated as `total_available - active_unexpired_holds`.
3. A client-side countdown timer displays remaining minutes and seconds.
4. If payment is completed within the window, the hold status converts to confirmed. If the timer reaches zero, the hold expires automatically.

### Indian Payment Gateway Simulation
The checkout modal includes simulated payment methods commonly used in India:
- **UPI Option:** Virtual Payment Address (VPA) input supporting handles like `name@okhdfcbank`, `name@upi`.
- **Card Option:** Simulated RuPay/Visa debit card input fields.
- **Dual Outcome Testing:**
  - **Simulate Success:** Records the booking, deducts inventory, generates an `EVT-` booking code, and issues a printable ticket pass.
  - **Simulate Failure:** Returns an HTTP 402 error simulating a bank decline, keeping the seat hold intact for immediate retry.

---

## 6. Database Schema

The database consists of 5 normalized relational tables:

### users
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique user identifier |
| name | TEXT | NOT NULL | User full name |
| email | TEXT | UNIQUE, NOT NULL | Login email address |
| password_hash | TEXT | NOT NULL | bcrypt hash of password |
| role | TEXT | CHECK IN ('admin', 'organizer', 'attendee') | User permission level |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Account creation date |

### events
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique event identifier |
| organizer_id | INTEGER | FOREIGN KEY -> users(id) ON DELETE CASCADE | Event creator |
| title | TEXT | NOT NULL | Event headline |
| description | TEXT | NOT NULL | Full event description |
| category | TEXT | NOT NULL | Event classification |
| date | TEXT | NOT NULL | Event date (YYYY-MM-DD) |
| time | TEXT | NOT NULL | Event start time |
| venue | TEXT | NOT NULL | Location or auditorium |
| image_url | TEXT | | Banner image link |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Record timestamp |

### ticket_types
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique tier identifier |
| event_id | INTEGER | FOREIGN KEY -> events(id) ON DELETE CASCADE | Associated event |
| name | TEXT | NOT NULL | 'General Admission' or 'VIP Access' |
| price | REAL | NOT NULL | Price in INR |
| total_seats | INTEGER | NOT NULL | Initial seat capacity |
| available_seats | INTEGER | NOT NULL | Remaining seats |
| perks | TEXT | | Perks included with ticket |

### ticket_holds
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Hold record identifier |
| hold_token | TEXT | UNIQUE, NOT NULL | Random token string |
| ticket_type_id | INTEGER | FOREIGN KEY -> ticket_types(id) | Held ticket tier |
| user_id | INTEGER | FOREIGN KEY -> users(id) | User holding seats |
| quantity | INTEGER | NOT NULL | Number of held seats |
| expires_at | INTEGER | NOT NULL | Epoch timestamp (ms) |
| status | TEXT | DEFAULT 'active' | 'active', 'released', 'converted' |

### bookings
| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Booking identifier |
| booking_code | TEXT | UNIQUE, NOT NULL | Reference code (e.g., EVT-123456) |
| user_id | INTEGER | FOREIGN KEY -> users(id) | Booking attendee |
| event_id | INTEGER | FOREIGN KEY -> events(id) | Booked event |
| ticket_type_id | INTEGER | FOREIGN KEY -> ticket_types(id) | Selected tier |
| quantity | INTEGER | NOT NULL | Number of tickets |
| unit_price | REAL | NOT NULL | Price per ticket |
| total_price | REAL | NOT NULL | Total amount paid |
| attendee_name | TEXT | NOT NULL | Primary ticket holder |
| attendee_email | TEXT | NOT NULL | Delivery email address |
| payment_status | TEXT | DEFAULT 'completed' | Payment status |
| payment_reference | TEXT | | Transaction identifier |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Booking timestamp |

---

## 7. Project File Structure

```
eventify/
|-- public/
|   |-- index.html         # Application markup and modals
|   |-- style.css          # Styling, dark theme, and print styles
|   |-- script.js          # Client controller, API fetch calls, countdown timer
|-- index.html             # Root copy for GitHub Pages deployment
|-- style.css              # Root stylesheet for GitHub Pages
|-- script.js              # Root script with static mode fallback
|-- server.js              # Express REST server, routes, and middleware
|-- database.js            # SQLite database schema, connections, seed data
|-- test-server.js         # Integration test suite for backend verification
|-- reset-db.js            # Utility script to reset and re-seed database
|-- render.yaml            # Render deployment blueprint
|-- package.json           # Node.js dependencies and run scripts
|-- .env.example           # Environment variable template
|-- .gitignore             # Ignored files (node_modules, logs)
|-- README.md              # Project documentation
```

---

## 8. How to Run Locally

### Prerequisites
- Node.js (version 18 or above)
- npm (Node Package Manager)

### Step 1: Clone or Open Project Directory
```bash
cd eventify
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Start the Application
```bash
npm start
```
For automatic restart during development:
```bash
npm run dev
```

### Step 4: Open in Web Browser
Open your browser and navigate to:
```
http://localhost:3000
```

### Step 5: Run Automated Tests
```bash
npm test
```

---

## 9. Deployment Links

- **GitHub Repository:** https://github.com/sivasri1204/eventify-ticket-reservation
- **Live Website (GitHub Pages):** https://sivasri1204.github.io/eventify-ticket-reservation/

---

## 10. Default Demo Accounts

The database comes pre-seeded with accounts for testing all three roles. The Sign In modal also includes one-click buttons for rapid evaluation:

| Role | Email | Password | Access Level |
|---|---|---|---|
| Attendee | alex.attendee@gmail.com | attendee123 | Browse, hold seats, pay, download passes |
| Organizer | sarah@nexusevents.com | organizer123 | View sales, manage events, see attendees |
| Admin | admin@eventify.com | admin123 | Platform overview, delete users/events |

---

## 11. REST API Endpoints

### Authentication
- `POST /api/auth/register` - Create new attendee or organizer account
- `POST /api/auth/login` - Authenticate user credentials and return JWT
- `GET /api/auth/me` - Fetch profile of currently logged-in user

### Events
- `GET /api/events` - Retrieve events with optional search and category query parameters
- `GET /api/events/:id` - Fetch single event details and ticket tiers
- `POST /api/events` - Create a new event (Organizer/Admin only)
- `PUT /api/events/:id` - Update an existing event (Event Owner/Admin)
- `DELETE /api/events/:id` - Remove an event from the system

### Holds and Bookings
- `POST /api/bookings/hold` - Create a 10-minute temporary seat reservation
- `DELETE /api/bookings/hold/:holdToken` - Release a temporary hold
- `POST /api/bookings/checkout` - Execute transaction and finalize booking
- `GET /api/bookings/my` - Fetch booking history for the logged-in user
- `DELETE /api/bookings/:id` - Cancel booking and return seats to inventory

### Dashboards
- `GET /api/organizer/stats` - Summary metrics and attendee lists for organizer
- `GET /api/admin/stats` - Platform-wide user and event statistics
- `DELETE /api/admin/users/:id` - Remove a user account (Admin only)

---

## 12. Viva Demonstration Questions and Answers

**Question 1: How does the system handle race conditions when two users book the last seat at the same time?**  
Answer: We use SQLite transactions (`BEGIN TRANSACTION` and `COMMIT`). The seat reduction query uses a guard condition: `UPDATE ticket_types SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?`. If two requests arrive at once, only the first transaction decrements the seat count. The second sees insufficient seats, updates 0 rows, and triggers a `ROLLBACK`.

**Question 2: How does the 10-minute hold function without blocking other attendees indefinitely?**  
Answer: A record is written to `ticket_holds` with a future timestamp (`Date.now() + 600000`). Available seat queries count active unexpired holds. A periodic background cleanup job and on-request checks expire holds older than 10 minutes. If an attendee leaves checkout, the seats become available again.

**Question 3: Why was SQLite selected over MySQL or MongoDB for this project?**  
Answer: SQLite is an embedded, serverless relational database engine. It requires zero configuration, stores the database in a single file (`eventify.db`), and supports standard SQL, ACID transactions, and foreign key constraints. This makes the project portable and easy to run on any machine without installing a standalone database server.

**Question 4: How are passwords secured in the database?**  
Answer: Passwords are never stored in plain text. We hash them using the `bcryptjs` library with a salt factor of 10 rounds before storing the string in the `password_hash` column. During authentication, `bcrypt.compareSync` verifies the entered password against the stored hash.

---

## 13. Future Enhancements

- Integration with a real payment gateway (Razorpay or Stripe).
- Automated email delivery of PDF tickets with genuine scannable QR verification.
- Interactive seat map selection for venue hall seats.
- Calendar export (.ics) for attendees.
