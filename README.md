# 🎟️ Eventify – Multi-Tenant Event & Ticket Reservation System

> **Web Technology Mini Project**  
> A complete, responsive, full-stack event ticketing platform with multi-tenant role-based access, dual ticket tiers, atomic seat reservation, 10-minute fair seat hold, and Indian Rupee (₹) mock payment gateway simulation (UPI & RuPay).

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Features](#-key-features)
3. [Technology Stack](#-technology-stack)
4. [System Architecture](#-system-architecture)
5. [Database Schema](#-database-schema)
6. [Demo Accounts](#-demo-accounts)
7. [Installation & Local Setup](#-installation--local-setup)
8. [🌐 How to Deploy for Free & Add Live Link to GitHub](#-how-to-deploy-for-free--add-live-link-to-github)
9. [REST API Documentation](#-rest-api-documentation)
10. [Viva & Project Demonstration Guide](#-viva--project-demonstration-guide)

---

## 🌟 Project Overview

**Eventify** is a Web Technology mini project designed to model real-world event ticketing ecosystems (like BookMyShow, Eventbrite, and Ticketmaster). It solves real-world challenges in event reservations:
- **Fair Temporary Holds:** When a user enters checkout, their seats are held for **10 minutes** so others cannot book them, preventing cart abandonment deadlocks.
- **Race Condition Prevention:** Utilizes atomic **SQLite transactions** (`BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`) with guard conditions (`available_seats >= quantity`) to prevent overselling when multiple attendees book simultaneously.
- **Multi-Tenant Separation:** Organizers manage only their hosted events and track gross revenue (₹); Admins have platform-wide governance; Attendees browse, book, and view digital passes.
- **Dual Ticket Tiers:** Support for General Admission (GA) and VIP Access with distinct Indian Rupee (₹) pricing, perk descriptions, and seat limits.
- **Indian Payment Methods:** Simulated checkout supporting **UPI (Google Pay, PhonePe, Paytm)** and **RuPay / Debit Cards**.

---

## ✨ Key Features

### 1. Attendee Features
- **Browse & Filter:** Search events by title, keywords, or Indian venue; filter by categories (*Tech, Music, Workshop, Sports, Comedy, Networking*).
- **Seat Availability:** Real-time seat counters showing *"Selling Fast"*, *"X seats remaining"*, or *"Sold Out"*.
- **10-Minute Fair Hold:** Seat reservation lock while in checkout with an animated countdown timer.
- **Indian Payment Gateway Simulation (₹):**
  - Simulated **UPI ID** input (`user@okhdfcbank`, `user@upi`) and **RuPay/Debit Cards**.
  - 🟢 **Simulate Success:** Atomically deducts inventory, generates confirmation code (`EVT-XXXXXX`) and transaction reference.
  - 🔴 **Simulate Failure:** Gracefully simulates bank decline/insufficient funds, preserves the 10-minute hold, and allows retry.
- **Digital Pass & Printing:** Access booked tickets with simulated QR codes, barcodes, and print-ready CSS layout.
- **Booking Cancellation:** Attendees can cancel bookings, automatically returning seats to the inventory pool.

### 2. Organizer Features
- **Dedicated Hub:** Real-time metrics: Active Events, Tickets Sold, Total Reservations, Gross Revenue in INR (₹).
- **Event Lifecycle (CRUD):** Create new events with customizable GA and VIP pricing (₹), edit dates/venues, and delete events.
- **Attendee Roster:** View attendee names, emails, tier purchased, and transaction timestamps for hosted events.

### 3. Administrator Features
- **Platform Overview:** Total registered users (breakdown by role), platform-wide events, total reservations, and platform gross sales (₹).
- **User Governance:** View all registered accounts and delete test/inactive users.
- **Event Audit:** Monitor and moderate events across all organizers.

---

## 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+) | Single-Page Application (SPA) architecture, responsive dark theme with purple accents, zero build tools needed. |
| **Backend** | Node.js & Express.js | Lightweight REST API server with modular routing, JWT authentication, and transaction handling. |
| **Database** | SQLite3 (`eventify.db`) | Serverless, zero-configuration relational database with foreign key cascades and transactions. |
| **Security** | `bcryptjs` & `jsonwebtoken` | Pure JavaScript password hashing (salt rounds: 10) and bearer token authentication. |

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend (Browser)"]
        UI["SPA Interface (HTML5 / CSS3 / Vanilla JS)"]
        State["State Manager (localStorage JWT, 10-Min Hold)"]
    end

    subgraph Server["Express Backend (Node.js)"]
        AuthMiddleware["JWT Auth Middleware & Role Guard"]
        API["REST API Endpoints (/api/events, /api/bookings, /api/organizer, /api/admin)"]
        HoldEngine["10-Min Temporary Hold Engine"]
        TxEngine["Atomic Transaction Engine"]
    end

    subgraph Database["SQLite Database (eventify.db)"]
        U[(users)]
        E[(events)]
        T[(ticket_types)]
        B[(bookings)]
        H[(ticket_holds)]
    end

    UI <-->|Fetch / JSON (₹ INR)| API
    API --> AuthMiddleware
    AuthMiddleware --> HoldEngine
    HoldEngine --> TxEngine
    TxEngine --> Database
```

---

## 🗄️ Database Schema

The database is automatically created and seeded with 6 Indian events on initial start.

### 1. `users`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `name` (TEXT)
- `email` (TEXT UNIQUE)
- `password_hash` (TEXT)
- `role` (TEXT: `'admin'`, `'organizer'`, `'attendee'`)
- `created_at` (DATETIME)

### 2. `events`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `organizer_id` (INTEGER -> users.id)
- `title` (TEXT)
- `description` (TEXT)
- `category` (TEXT)
- `date` (TEXT)
- `time` (TEXT)
- `venue` (TEXT)
- `image_url` (TEXT)
- `created_at` (DATETIME)

### 3. `ticket_types`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `event_id` (INTEGER -> events.id)
- `name` (TEXT: `'General Admission'`, `'VIP Access'`)
- `price` (REAL: in INR ₹)
- `total_seats` (INTEGER)
- `available_seats` (INTEGER)
- `perks` (TEXT)

### 4. `ticket_holds` (10-Minute Fair Hold)
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `hold_token` (TEXT UNIQUE)
- `ticket_type_id` (INTEGER -> ticket_types.id)
- `user_id` (INTEGER -> users.id)
- `quantity` (INTEGER)
- `expires_at` (INTEGER epoch timestamp)
- `status` (TEXT: `'active'`, `'released'`, `'converted'`)

### 5. `bookings`
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `booking_code` (TEXT UNIQUE: e.g. `EVT-621944`)
- `user_id` (INTEGER -> users.id)
- `event_id` (INTEGER -> events.id)
- `ticket_type_id` (INTEGER -> ticket_types.id)
- `quantity` (INTEGER)
- `unit_price` (REAL: in ₹)
- `total_price` (REAL: in ₹)
- `attendee_name` (TEXT)
- `attendee_email` (TEXT)
- `payment_status` (TEXT: `'completed'`)
- `payment_reference` (TEXT)
- `created_at` (DATETIME)

---

## 🔑 Demo Accounts

The project includes pre-seeded demo accounts. In addition, the login modal has **1-Click Demo Sign-In Buttons** for quick viva presentation:

| Role | Email | Password | What You Can Test |
|---|---|---|---|
| **Attendee** | `alex.attendee@gmail.com` | `attendee123` | Browse events, hold seats, simulate UPI/Card payment, view & print digital ticket passes. |
| **Organizer** | `sarah@nexusevents.com` | `organizer123` | View sales analytics, gross revenue (₹), create new events, edit/delete hosted events, inspect attendees. |
| **Admin** | `admin@eventify.com` | `admin123` | Platform oversight, user table management, system-wide event moderation. |

---

## 🚀 Installation & Local Setup

### Prerequisites
- Node.js (v18, v20, v22, or v24+)
- npm

### Step 1: Open Terminal in Project Directory
```bash
cd eventify
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Run the Server
```bash
npm start
```
*For live auto-reloading during development:*
```bash
npm run dev
```

### Step 4: Open in Web Browser
Open your browser and navigate to:
```
http://localhost:3000
```

### Step 5: Run Automated Integration Tests
Verify database integrity, password hashing, 10-minute hold, and INR checkout:
```bash
npm test
```

---

## 🌐 How to Deploy for Free & Add Live Link to GitHub

You can host **Eventify** online 100% free on **Render** (or Railway) so that anyone can open your live website from your GitHub repository link.

### Part A: Upload Project to GitHub

#### Option 1: Using the GitHub Website (No Git installation needed)
1. Go to [github.com](https://github.com) and log in.
2. Click the **"+"** icon in the top-right corner and select **"New repository"**.
3. Name your repository (e.g., `eventify-event-reservation`) and set it to **Public**.
4. Click **"Create repository"**.
5. On the next screen, click **"uploading an existing file"**.
6. Drag and drop all the project files (`server.js`, `database.js`, `package.json`, `render.yaml`, `README.md`, `.env.example`, `.gitignore`, and the entire `public/` folder).  
   *(Do NOT upload `node_modules` or `eventify.db`)*
7. Click **"Commit changes"**.

#### Option 2: Using Git Terminal
```bash
git init
git add .
git commit -m "Initial commit of Eventify project"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

---

### Part B: Deploy to Render (Free Cloud Hosting)

1. Sign up / Log in to [render.com](https://render.com) using your GitHub account.
2. Click **"New +"** in the top right and select **"Web Service"**.
3. Select your GitHub repository (`eventify-event-reservation`) and click **"Connect"**.
4. Render will automatically detect the included `render.yaml` configuration:
   - **Name:** `eventify`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
5. Click **"Deploy Web Service"**.
6. Render will install dependencies and start your server in ~1-2 minutes.
7. Once live, Render displays your public URL at the top:
   ```text
   https://eventify-xxxx.onrender.com
   ```

---

### Part C: Add the Live Link to Your GitHub Repository

1. Open your repository on [github.com](https://github.com).
2. On the right sidebar, click the **⚙️ (Settings)** icon next to **"About"**.
3. In the **Website** field, paste your Render link:
   ```text
   https://eventify-xxxx.onrender.com
   ```
4. Check the box **"Use your README's description"** or enter:  
   *Eventify – Multi-Tenant Event & Ticket Reservation System (Web Technology Mini Project)*
5. Click **"Save changes"**.
6. Now your live website link is pinned prominently on your GitHub repository!

---

## 📡 REST API Documentation

### Authentication Endpoints
- `POST /api/auth/register` – Register new Attendee or Organizer account.
- `POST /api/auth/login` – Authenticate with email/password and obtain JWT.
- `GET /api/auth/me` – Fetch current logged-in profile (Requires Bearer token).

### Events Endpoints
- `GET /api/events` – Query events with optional `?search=` and `?category=`.
- `GET /api/events/:id` – Fetch event details with ticket tiers and organizer info.
- `POST /api/events` – Create new event with GA & VIP tiers (Organizer/Admin only).
- `PUT /api/events/:id` – Update event and ticket prices/capacities (Organizer owner/Admin).
- `DELETE /api/events/:id` – Delete event (Organizer owner/Admin).

### Reservation & Holds Endpoints
- `POST /api/bookings/hold` – Lock seats for 10 minutes (`{ ticket_type_id, quantity }`).
- `DELETE /api/bookings/hold/:holdToken` – Manually release hold.
- `POST /api/bookings/checkout` – Finalize payment & booking in INR (`{ holdToken, ticket_type_id, quantity, attendee_name, attendee_email, simulate_failure }`).
- `GET /api/bookings/my` – Retrieve attendee's confirmed bookings.
- `DELETE /api/bookings/:id` – Cancel booking and restore available seats.

### Multi-Tenant Dashboards
- `GET /api/organizer/stats` – Metrics, hosted events, and attendees for organizer.
- `GET /api/admin/stats` – Platform users, events, and gross sales for admin.
- `DELETE /api/admin/users/:id` – Remove user account.

---

## 🎓 Viva & Project Demonstration Guide

### How to Demonstrate to the Examiner:

1. **Homepage & Event Discovery:**
   - Show the responsive dark interface with purple gradients and Indian Rupee (₹) pricing.
   - Type in the search bar (e.g., *"Bengaluru"*, *"Mumbai"*, or *"Tech"*) to demonstrate real-time filtering.
   - Click category filter pills (*Tech, Music, Workshop, Sports, Comedy, Networking*).

2. **Attendee Booking Flow & 10-Minute Hold:**
   - Click **"Sign In"** -> click the **"👤 Attendee"** 1-click pill to instantly log in as Alex Rivera.
   - Pick an event and click **"Book Tickets"**.
   - Select **General Admission (₹1,499)** or **VIP Access (₹4,999)**, change quantity, and observe the live subtotal.
   - Click **"Reserve & Proceed to Payment"**:
     - Point out the **10-minute hold countdown timer** ticking down live.
     - Explain: *"This prevents other users from stealing the seat while we complete payment."*
   - Select payment mode: **⚡ UPI / QR** or **💳 RuPay / Debit Card**.
   - Click **"🔴 Simulate Payment Failure"**:
     - Show the graceful error message without losing the hold.
   - Click **"🟢 Pay in INR (Simulate Success)"**:
     - Show the atomic transaction confirmation, booking reference code, and receipt.
   - Click **"View My Bookings"** and click **"🖨️ View Digital Pass"** to show the boarding pass with mock QR code and barcode.

3. **Organizer Hub & Multi-Tenancy:**
   - Click **"Sign Out"**, then sign in with the **"📊 Organizer"** 1-click pill (Sarah Jenkins).
   - Show that Sarah only sees her own events and attendee list, not Marcus's.
   - Click **"➕ Create New Event"**, enter details, set GA and VIP pricing in ₹, and publish.
   - Switch back to "Explore Events" to show the new event immediately appearing with tickets for sale.

4. **Admin Panel:**
   - Sign in with the **"⚡ Admin"** 1-click pill.
   - Show the platform-wide metrics (Total Users, Events, Bookings, Platform Revenue in ₹).
   - Demonstrate user governance and event audit capabilities.

### Common Viva Questions & Answers:

- **Q: How does the system prevent overselling tickets?**
  *A:* We use SQLite database transactions (`BEGIN TRANSACTION ... COMMIT`). When booking, the query executes `UPDATE ticket_types SET available_seats = available_seats - ? WHERE id = ? AND available_seats >= ?`. If `available_seats` is insufficient, `changes` is 0, the server triggers a `ROLLBACK`, and no tickets are oversold.

- **Q: Why use SQLite for this project?**
  *A:* SQLite is a zero-configuration, serverless, file-based SQL database that supports standard relational tables, foreign key cascades, and ACID transactions. It requires no separate database server setup, making it reliable for demonstrations.

- **Q: How are passwords secured?**
  *A:* Passwords are never stored in plain text. We hash them using `bcryptjs` with 10 salt rounds before saving to the database, protecting user credentials.

- **Q: How does the 10-minute hold work?**
  *A:* A record is created in `ticket_holds` with a timestamp 10 minutes in the future (`Date.now() + 600000`). Available seat queries subtract active holds. A background interval cleans expired holds, and checkout converts the hold to a completed booking.

---

## 📄 License
This project is open-source and created for educational and college demonstration purposes under the MIT License.
