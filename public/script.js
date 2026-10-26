/**
 * script.js - Eventify Client-Side Application Controller
 * Handles SPA navigation, real-time REST API integration, authentication,
 * fair 10-minute ticket holds, mock payment simulation, and multi-tenant dashboards.
 */

const app = {
  // Application State
  currentUser: null,
  token: localStorage.getItem('eventify_token') || null,
  events: [],
  selectedCategory: 'All',
  searchQuery: '',
  activeView: 'explore',

  // Active Booking Flow State
  booking: {
    event: null,
    selectedTicket: null,
    quantity: 1,
    holdToken: null,
    holdExpiresAt: null,
    holdInterval: null,
    lastConfirmedBooking: null
  },

  // -----------------------------------------------------------
  // INITIALIZATION
  // -----------------------------------------------------------
  async init() {
    this.setupEventListeners();
    await this.checkAuthSession();
    await this.fetchEvents();
  },

  setupEventListeners() {
    // Escape key closes modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModals();
        this.closeBookingModal();
      }
    });
  },

  // -----------------------------------------------------------
  // REST API WRAPPER
  // -----------------------------------------------------------
  async api(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = { method, headers };
    if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(endpoint, options);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || `Request failed with status ${response.status}`);
      }
      return json;
    } catch (err) {
      console.error(`API Error [${method} ${endpoint}]:`, err.message);
      throw err;
    }
  },

  // -----------------------------------------------------------
  // AUTHENTICATION & SESSION MANAGEMENT
  // -----------------------------------------------------------
  async checkAuthSession() {
    if (!this.token) {
      this.updateAuthNav();
      return;
    }

    try {
      const res = await this.api('/api/auth/me');
      this.currentUser = res.user;
    } catch (err) {
      // Token invalid or expired
      this.token = null;
      this.currentUser = null;
      localStorage.removeItem('eventify_token');
    }
    this.updateAuthNav();
  },

  updateAuthNav() {
    const authContainer = document.getElementById('nav-auth-container');
    const navBookings = document.getElementById('nav-bookings');
    const navOrganizer = document.getElementById('nav-organizer');
    const navAdmin = document.getElementById('nav-admin');

    if (!this.currentUser) {
      // Logged Out
      navBookings.style.display = 'none';
      navOrganizer.style.display = 'none';
      navAdmin.style.display = 'none';

      authContainer.innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="app.openAuthModal('login')">Sign In</button>
        <button class="btn btn-primary btn-sm" onclick="app.openAuthModal('register')">Get Started</button>
      `;
    } else {
      // Logged In
      const role = this.currentUser.role;
      const initial = this.currentUser.name.charAt(0).toUpperCase();

      navBookings.style.display = 'inline-flex';
      navOrganizer.style.display = (role === 'organizer' || role === 'admin') ? 'inline-flex' : 'none';
      navAdmin.style.display = (role === 'admin') ? 'inline-flex' : 'none';

      authContainer.innerHTML = `
        <div class="user-nav-badge">
          <div class="user-avatar">${initial}</div>
          <div class="user-info-text">
            <span>${this.escapeHtml(this.currentUser.name)}</span>
            <span class="badge-role badge-${role}">${role}</span>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="app.logout()">Sign Out</button>
      `;
    }
  },

  openAuthModal(tab = 'login') {
    this.switchAuthTab(tab);
    document.getElementById('modal-auth').classList.add('active');
  },

  switchAuthTab(tab) {
    const loginTab = document.getElementById('tab-login');
    const regTab = document.getElementById('tab-register');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');

    if (tab === 'login') {
      loginTab.classList.add('active');
      regTab.classList.remove('active');
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
    } else {
      regTab.classList.add('active');
      loginTab.classList.remove('active');
      formRegister.style.display = 'block';
      formLogin.style.display = 'none';
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await this.api('/api/auth/login', 'POST', { email, password });
      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem('eventify_token', res.token);

      this.closeModals();
      this.updateAuthNav();
      this.showToast(`Welcome back, ${res.user.name}!`, 'success');

      // Auto-navigate based on role
      if (res.user.role === 'admin') this.showView('admin');
      else if (res.user.role === 'organizer') this.showView('organizer');
      else this.fetchEvents();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const roleRadio = document.querySelector('input[name="reg-role"]:checked');
    const role = roleRadio ? roleRadio.value : 'attendee';

    try {
      const res = await this.api('/api/auth/register', 'POST', { name, email, password, role });
      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem('eventify_token', res.token);

      this.closeModals();
      this.updateAuthNav();
      this.showToast(`Account created as ${role}!`, 'success');

      if (role === 'organizer') this.showView('organizer');
      else this.fetchEvents();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async quickLogin(email, password) {
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = password;
    this.switchAuthTab('login');
    try {
      const res = await this.api('/api/auth/login', 'POST', { email, password });
      this.token = res.token;
      this.currentUser = res.user;
      localStorage.setItem('eventify_token', res.token);

      this.closeModals();
      this.updateAuthNav();
      this.showToast(`Logged in as ${res.user.name} (${res.user.role})!`, 'success');

      if (res.user.role === 'admin') this.showView('admin');
      else if (res.user.role === 'organizer') this.showView('organizer');
      else this.showView('explore');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem('eventify_token');
    this.updateAuthNav();
    this.showView('explore');
    this.showToast('You have signed out.', 'info');
  },

  // -----------------------------------------------------------
  // VIEW NAVIGATION (Single Page Architecture)
  // -----------------------------------------------------------
  showView(viewName) {
    this.activeView = viewName;

    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Hide all view containers
    document.getElementById('view-explore').style.display = (viewName === 'explore') ? 'block' : 'none';
    document.getElementById('view-bookings').style.display = (viewName === 'bookings') ? 'block' : 'none';
    document.getElementById('view-organizer').style.display = (viewName === 'organizer') ? 'block' : 'none';
    document.getElementById('view-admin').style.display = (viewName === 'admin') ? 'block' : 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Load data for specific view
    if (viewName === 'explore') this.fetchEvents();
    else if (viewName === 'bookings') this.fetchMyBookings();
    else if (viewName === 'organizer') this.fetchOrganizerDashboard();
    else if (viewName === 'admin') this.fetchAdminDashboard();
  },

  // -----------------------------------------------------------
  // EVENT EXPLORATION & DISCOVERY
  // -----------------------------------------------------------
  async fetchEvents() {
    const grid = document.getElementById('events-grid');
    grid.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Fetching real-time event inventory...</p>
      </div>
    `;

    try {
      const params = new URLSearchParams();
      if (this.searchQuery) params.append('search', this.searchQuery);
      if (this.selectedCategory && this.selectedCategory !== 'All') params.append('category', this.selectedCategory);

      const res = await this.api(`/api/events?${params.toString()}`);
      this.events = res.events;
      this.renderEvents(res.events);
    } catch (err) {
      grid.innerHTML = `
        <div class="loading-state">
          <p style="color: #ef4444;">❌ Failed to load events: ${err.message}</p>
          <button class="btn btn-outline btn-sm mt-3" onclick="app.fetchEvents()">Retry</button>
        </div>
      `;
    }
  },

  renderEvents(events) {
    const grid = document.getElementById('events-grid');
    if (!events || events.length === 0) {
      grid.innerHTML = `
        <div class="loading-state">
          <p>🔍 No events found matching your filter criteria.</p>
          <button class="btn btn-outline btn-sm mt-3" onclick="app.clearSearch(); app.filterByCategory('All');">
            Reset Filters
          </button>
        </div>
      `;
      return;
    }

    grid.innerHTML = events.map(evt => {
      const availableSeats = evt.total_available_seats || 0;
      let seatBadge = '';
      if (availableSeats <= 0) {
        seatBadge = `<span class="badge-seats-status badge-seats-out">Sold Out</span>`;
      } else if (availableSeats < 20) {
        seatBadge = `<span class="badge-seats-status badge-seats-low">Only ${availableSeats} left!</span>`;
      } else {
        seatBadge = `<span class="badge-seats-status">● ${availableSeats} Available</span>`;
      }

      const gaTicket = evt.tickets.find(t => t.name === 'General Admission') || evt.tickets[0];
      const vipTicket = evt.tickets.find(t => t.name === 'VIP Access') || evt.tickets[1];

      const minPrice = evt.min_price !== undefined ? parseFloat(evt.min_price).toFixed(2) : '0.00';

      const isSoldOut = availableSeats <= 0;
      const isOwnerOrAdmin = this.currentUser && (this.currentUser.role === 'admin' || (this.currentUser.role === 'organizer' && this.currentUser.id === evt.organizer_id));

      return `
        <article class="event-card">
          <div class="event-card-banner">
            <img src="${this.escapeHtml(evt.image_url)}" alt="${this.escapeHtml(evt.title)}" onerror="this.src='https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80'">
            <span class="badge-category">${this.escapeHtml(evt.category)}</span>
            ${seatBadge}
          </div>
          <div class="event-card-body">
            <div class="event-card-meta">
              <span>📅 ${this.escapeHtml(evt.date)} • ${this.escapeHtml(evt.time)}</span>
            </div>
            <h3 class="event-card-title">${this.escapeHtml(evt.title)}</h3>
            <p class="event-card-desc">${this.escapeHtml(evt.description)}</p>
            <div class="event-card-location">
              <span>📍 ${this.escapeHtml(evt.venue)}</span>
            </div>

            <!-- Dual Tier Badges -->
            <div class="event-tier-badges">
              <div class="tier-pill">
                <strong>GA Pass</strong>
                <span>₹${gaTicket ? gaTicket.price.toFixed(2) : '-'}</span> (${gaTicket ? gaTicket.available_seats : 0} left)
              </div>
              <div class="tier-pill tier-vip">
                <strong>VIP Pass</strong>
                <span>₹${vipTicket ? vipTicket.price.toFixed(2) : '-'}</span> (${vipTicket ? vipTicket.available_seats : 0} left)
              </div>
            </div>

            <div class="event-card-footer">
              <div class="price-display">
                <span class="price-label">Tickets from</span>
                <span class="price-amount">₹${minPrice}</span>
              </div>
              <div style="display: flex; gap: 0.4rem;">
                ${isOwnerOrAdmin ? `
                  <button class="btn btn-outline btn-sm" title="Edit Event" onclick="app.openEditEventModal(${evt.id})">✏️</button>
                  <button class="btn btn-outline btn-sm" title="Delete Event" onclick="app.deleteEvent(${evt.id})">🗑️</button>
                ` : ''}
                <button class="btn btn-primary btn-sm" ${isSoldOut ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} onclick="app.openBookingModal(${evt.id})">
                  ${isSoldOut ? 'Sold Out' : 'Book Tickets'}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  filterByCategory(cat) {
    this.selectedCategory = cat;
    document.querySelectorAll('.category-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === cat);
    });
    this.fetchEvents();
  },

  handleSearchInput(e) {
    this.searchQuery = e.target.value.trim();
    const clearBtn = document.getElementById('btn-clear-search');
    clearBtn.style.display = this.searchQuery ? 'inline-block' : 'none';

    // Debounce search
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.fetchEvents();
    }, 350);
  },

  clearSearch() {
    this.searchQuery = '';
    document.getElementById('event-search-input').value = '';
    document.getElementById('btn-clear-search').style.display = 'none';
    this.fetchEvents();
  },

  // -----------------------------------------------------------
  // BOOKING & 10-MINUTE SEAT HOLD FLOW
  // -----------------------------------------------------------
  async openBookingModal(eventId) {
    if (!this.currentUser) {
      this.showToast('Please sign in or use 1-click demo to book tickets.', 'info');
      this.openAuthModal('login');
      return;
    }

    try {
      const res = await this.api(`/api/events/${eventId}`);
      const evt = res.event;

      if (!evt.tickets || evt.tickets.length === 0) {
        this.showToast('No ticket tiers configured for this event.', 'error');
        return;
      }

      this.booking.event = evt;
      // Default to General Admission if available, or first tier
      const ga = evt.tickets.find(t => t.name === 'General Admission' && t.available_seats > 0);
      this.booking.selectedTicket = ga || evt.tickets[0];
      this.booking.quantity = 1;
      this.booking.holdToken = null;

      // Populate Step 1 UI
      document.getElementById('book-modal-title').textContent = evt.title;
      document.getElementById('book-modal-subtitle').textContent = `📅 ${evt.date} • 📍 ${evt.venue}`;
      document.getElementById('booking-qty-display').textContent = '1';

      this.renderBookingTiers();
      this.updateBookingSummary();

      // Show Step 1, hide others
      document.getElementById('booking-step-select').style.display = 'block';
      document.getElementById('booking-step-checkout').style.display = 'none';
      document.getElementById('booking-step-success').style.display = 'none';

      document.getElementById('modal-booking').classList.add('active');
    } catch (err) {
      this.showToast('Error loading event details: ' + err.message, 'error');
    }
  },

  renderBookingTiers() {
    const container = document.getElementById('booking-tier-options');
    const tickets = this.booking.event.tickets;

    container.innerHTML = tickets.map(t => {
      const isSelected = this.booking.selectedTicket && this.booking.selectedTicket.id === t.id;
      const isOut = t.available_seats <= 0;

      return `
        <div class="ticket-tier-option ${isSelected ? 'selected' : ''}" 
             onclick="${isOut ? '' : `app.selectBookingTier(${t.id})`}" 
             style="${isOut ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
          <div>
            <div class="tier-name-badge">${this.escapeHtml(t.name)} ${isSelected ? '✓' : ''}</div>
            <div class="tier-perks-text">${this.escapeHtml(t.perks || 'Standard entry')}</div>
          </div>
          <div>
            <div class="tier-price-tag">₹${parseFloat(t.price).toFixed(2)}</div>
            <div class="tier-seats-remaining">${isOut ? 'Sold Out' : `${t.available_seats} seats left`}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  selectBookingTier(ticketId) {
    const t = this.booking.event.tickets.find(item => item.id === ticketId);
    if (t && t.available_seats > 0) {
      this.booking.selectedTicket = t;
      this.booking.quantity = 1;
      document.getElementById('booking-qty-display').textContent = '1';
      this.renderBookingTiers();
      this.updateBookingSummary();
    }
  },

  changeBookingQty(delta) {
    if (!this.booking.selectedTicket) return;
    const max = Math.min(10, this.booking.selectedTicket.available_seats);
    let newQty = this.booking.quantity + delta;
    if (newQty < 1) newQty = 1;
    if (newQty > max) {
      this.showToast(`Maximum ${max} tickets can be booked for this tier.`, 'info');
      newQty = max;
    }
    this.booking.quantity = newQty;
    document.getElementById('booking-qty-display').textContent = newQty;
    this.updateBookingSummary();
  },

  updateBookingSummary() {
    if (!this.booking.selectedTicket) return;
    const unitPrice = parseFloat(this.booking.selectedTicket.price);
    const total = unitPrice * this.booking.quantity;

    document.getElementById('summary-tier-name').textContent = this.booking.selectedTicket.name;
    document.getElementById('summary-unit-price').textContent = `₹${unitPrice.toFixed(2)}`;
    document.getElementById('summary-total-price').textContent = `₹${total.toFixed(2)}`;
  },

  // 10-Minute Hold Request
  async proceedToHold() {
    if (!this.booking.selectedTicket) {
      this.showToast('Please select a ticket tier.', 'error');
      return;
    }

    const btn = document.getElementById('btn-proceed-hold');
    btn.disabled = true;
    btn.textContent = 'Securing Seats...';

    try {
      const res = await this.api('/api/bookings/hold', 'POST', {
        ticket_type_id: this.booking.selectedTicket.id,
        quantity: this.booking.quantity
      });

      this.booking.holdToken = res.holdToken;
      this.booking.holdExpiresAt = res.expiresAt;

      // Start 10-Minute Hold Countdown
      this.startHoldCountdown(res.expiresAt);

      // Populate Step 2 Checkout Info
      document.getElementById('checkout-event-title').textContent = this.booking.event.title;
      document.getElementById('checkout-tier-qty').textContent = `${this.booking.selectedTicket.name} (x${this.booking.quantity})`;
      document.getElementById('checkout-total-amount').textContent = `₹${res.totalPrice.toFixed(2)}`;

      document.getElementById('checkout-attendee-name').value = this.currentUser.name;
      document.getElementById('checkout-attendee-email').value = this.currentUser.email;

      // Switch view to Step 2
      document.getElementById('booking-step-select').style.display = 'none';
      document.getElementById('booking-step-checkout').style.display = 'block';

      this.showToast('10-minute fair seat hold reserved for you!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Reserve & Proceed to Payment ➔';
    }
  },

  startHoldCountdown(expiresAt) {
    if (this.booking.holdInterval) {
      clearInterval(this.booking.holdInterval);
    }

    const timerDisplay = document.getElementById('hold-countdown');

    const updateTimer = () => {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        clearInterval(this.booking.holdInterval);
        timerDisplay.textContent = '00:00';
        this.showToast('⚠️ Your 10-minute hold has expired. Seats returned to inventory.', 'error');
        this.closeBookingModal();
        this.fetchEvents();
        return;
      }

      const totalSec = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      timerDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    updateTimer();
    this.booking.holdInterval = setInterval(updateTimer, 1000);
  },

  async cancelSeatHold() {
    if (this.booking.holdInterval) {
      clearInterval(this.booking.holdInterval);
    }

    if (this.booking.holdToken) {
      try {
        await this.api(`/api/bookings/hold/${this.booking.holdToken}`, 'DELETE');
        this.showToast('Seat hold released.', 'info');
      } catch (e) {}
      this.booking.holdToken = null;
    }

    // Revert to Step 1
    document.getElementById('booking-step-checkout').style.display = 'none';
    document.getElementById('booking-step-select').style.display = 'block';
  },

  closeBookingModal() {
    if (this.booking.holdInterval) {
      clearInterval(this.booking.holdInterval);
    }
    if (this.booking.holdToken) {
      this.api(`/api/bookings/hold/${this.booking.holdToken}`, 'DELETE').catch(() => {});
      this.booking.holdToken = null;
    }
    document.getElementById('modal-booking').classList.remove('active');
  },

  switchPaymentMethod(method) {
    const upiDiv = document.getElementById('pay-method-upi');
    const cardDiv = document.getElementById('pay-method-card');
    const tabUpi = document.getElementById('tab-pay-upi');
    const tabCard = document.getElementById('tab-pay-card');

    if (method === 'upi') {
      upiDiv.style.display = 'block';
      cardDiv.style.display = 'none';
      tabUpi.style.borderColor = 'var(--accent-purple)';
      tabUpi.style.background = 'rgba(139, 92, 246, 0.2)';
      tabCard.style.borderColor = 'var(--border-light)';
      tabCard.style.background = 'var(--bg-tertiary)';
    } else {
      upiDiv.style.display = 'none';
      cardDiv.style.display = 'block';
      tabCard.style.borderColor = 'var(--accent-purple)';
      tabCard.style.background = 'rgba(139, 92, 246, 0.2)';
      tabUpi.style.borderColor = 'var(--border-light)';
      tabUpi.style.background = 'var(--bg-tertiary)';
    }
  },

  // -----------------------------------------------------------
  // MOCK PAYMENT EXECUTION (Success vs Failure Simulation)
  // -----------------------------------------------------------
  async executePayment(simulateFailure = false) {
    const attendeeName = document.getElementById('checkout-attendee-name').value.trim();
    const attendeeEmail = document.getElementById('checkout-attendee-email').value.trim();

    if (!attendeeName || !attendeeEmail) {
      this.showToast('Please provide your name and email for ticket delivery.', 'error');
      return;
    }

    const successBtn = document.getElementById('btn-pay-success');
    const failBtn = document.getElementById('btn-pay-fail');

    successBtn.disabled = true;
    failBtn.disabled = true;

    try {
      const res = await this.api('/api/bookings/checkout', 'POST', {
        holdToken: this.booking.holdToken,
        ticket_type_id: this.booking.selectedTicket.id,
        quantity: this.booking.quantity,
        attendee_name: attendeeName,
        attendee_email: attendeeEmail,
        simulate_failure: simulateFailure
      });

      // Clear countdown
      if (this.booking.holdInterval) clearInterval(this.booking.holdInterval);
      this.booking.holdToken = null;

      // Successful Booking!
      this.booking.lastConfirmedBooking = res.booking;

      // Render confirmation receipt
      document.getElementById('confirmation-receipt-content').innerHTML = `
        <div class="review-item">
          <span class="text-muted">Booking Reference:</span>
          <strong class="pass-code-pill">${res.booking.booking_code}</strong>
        </div>
        <div class="review-item">
          <span class="text-muted">Event:</span>
          <strong>${this.escapeHtml(res.booking.event_title)}</strong>
        </div>
        <div class="review-item">
          <span class="text-muted">Tier & Seats:</span>
          <span>${this.escapeHtml(res.booking.ticket_name)} (x${res.booking.quantity})</span>
        </div>
        <div class="review-item">
          <span class="text-muted">Amount Paid:</span>
          <strong class="highlight-price">₹${parseFloat(res.booking.total_price).toFixed(2)}</strong>
        </div>
        <div class="review-item">
          <span class="text-muted">Payment Ref:</span>
          <span class="text-muted">${res.booking.payment_reference}</span>
        </div>
      `;

      // Switch to Step 3
      document.getElementById('booking-step-checkout').style.display = 'none';
      document.getElementById('booking-step-success').style.display = 'block';

      this.showToast('🎉 Payment approved! Your tickets are reserved.', 'success');
      this.fetchEvents(); // Refresh seat counts in database
    } catch (err) {
      // Handles simulated payment failure or real errors gracefully
      this.showToast(err.message, 'error');
    } finally {
      successBtn.disabled = false;
      failBtn.disabled = false;
    }
  },

  // -----------------------------------------------------------
  // ATTENDEE BOOKING HISTORY
  // -----------------------------------------------------------
  async fetchMyBookings() {
    const container = document.getElementById('my-bookings-container');
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Loading your event reservations...</p>
      </div>
    `;

    try {
      const res = await this.api('/api/bookings/my');
      const bookings = res.bookings;

      if (!bookings || bookings.length === 0) {
        container.innerHTML = `
          <div class="loading-state">
            <p>🎟️ You have not booked any event passes yet.</p>
            <button class="btn btn-primary btn-sm mt-3" onclick="app.showView('explore')">
              Explore Available Events
            </button>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="bookings-grid">
          ${bookings.map(b => `
            <div class="booking-item-card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="booking-code-tag">🎫 ${b.booking_code}</span>
                <span class="badge-role badge-attendee">CONFIRMED</span>
              </div>
              <div>
                <h3 style="font-size: 1.15rem; color: #fff; margin-bottom: 0.25rem;">${this.escapeHtml(b.event_title)}</h3>
                <p style="font-size: 0.85rem; color: #c084fc;">📅 ${this.escapeHtml(b.event_date)} • ${this.escapeHtml(b.event_time)}</p>
                <p style="font-size: 0.82rem; color: var(--text-dim); margin-top: 0.2rem;">📍 ${this.escapeHtml(b.event_venue)}</p>
              </div>
              <div style="background: var(--bg-tertiary); padding: 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between;">
                  <span>Ticket Tier:</span>
                  <strong>${this.escapeHtml(b.ticket_name)} (x${b.quantity})</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 0.25rem;">
                  <span>Total Paid:</span>
                  <strong style="color: #38bdf8;">₹${parseFloat(b.total_price).toFixed(2)}</strong>
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                <button class="btn btn-primary btn-sm btn-block" onclick='app.openTicketPass(${JSON.stringify(b).replace(/'/g, "&#39;")})'>
                  🖨️ View Digital Pass
                </button>
                <button class="btn btn-danger btn-sm" onclick="app.cancelBooking(${b.id})">
                  Cancel
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: #ef4444;">Error fetching bookings: ${err.message}</p>`;
    }
  },

  async cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking? Your seats will be restored to inventory.')) {
      return;
    }

    try {
      const res = await this.api(`/api/bookings/${bookingId}`, 'DELETE');
      this.showToast(res.message, 'success');
      this.fetchMyBookings();
      this.fetchEvents();
    } catch (err) {
      this.showToast('Failed to cancel booking: ' + err.message, 'error');
    }
  },

  // -----------------------------------------------------------
  // DIGITAL TICKET PASS & PRINTING
  // -----------------------------------------------------------
  openTicketPass(booking) {
    document.getElementById('pass-booking-code').textContent = booking.booking_code;
    document.getElementById('pass-event-title').textContent = booking.event_title;
    document.getElementById('pass-event-datetime').textContent = `${booking.event_date} • ${booking.event_time || ''}`;
    document.getElementById('pass-event-venue').textContent = booking.event_venue;
    document.getElementById('pass-ticket-tier').textContent = `${booking.ticket_name} (x${booking.quantity})`;
    document.getElementById('pass-attendee-name').textContent = booking.attendee_name;
    document.getElementById('pass-payment-ref').textContent = booking.payment_reference || 'PAID-ONLINE';

    document.getElementById('modal-ticket-pass').classList.add('active');
  },

  printCurrentPass() {
    if (this.booking.lastConfirmedBooking) {
      this.openTicketPass(this.booking.lastConfirmedBooking);
    }
  },

  // -----------------------------------------------------------
  // ORGANIZER HUB & EVENT CRUD
  // -----------------------------------------------------------
  async fetchOrganizerDashboard() {
    try {
      const res = await this.api('/api/organizer/stats');
      const { summary, events, recentAttendees } = res;

      // Update stat cards
      document.getElementById('org-stat-events').textContent = summary.total_events;
      document.getElementById('org-stat-tickets').textContent = summary.total_tickets_sold;
      document.getElementById('org-stat-bookings').textContent = summary.total_bookings;
      document.getElementById('org-stat-revenue').textContent = `₹${parseFloat(summary.total_revenue).toFixed(2)}`;

      // Render hosted events table
      const eventsTbody = document.getElementById('organizer-events-tbody');
      if (events.length === 0) {
        eventsTbody.innerHTML = `<tr><td colspan="7" class="text-center">No events created yet. Click "Create New Event" to publish one!</td></tr>`;
      } else {
        eventsTbody.innerHTML = events.map(evt => {
          const ga = evt.tickets.find(t => t.name === 'General Admission') || { available_seats: 0, total_seats: 0 };
          const vip = evt.tickets.find(t => t.name === 'VIP Access') || { available_seats: 0, total_seats: 0 };

          return `
            <tr>
              <td><strong>${this.escapeHtml(evt.title)}</strong></td>
              <td><span class="badge-category">${this.escapeHtml(evt.category)}</span></td>
              <td>${this.escapeHtml(evt.date)}<br><small class="text-muted">${this.escapeHtml(evt.venue)}</small></td>
              <td>${ga.available_seats} / ${ga.total_seats}</td>
              <td>${vip.available_seats} / ${vip.total_seats}</td>
              <td style="color: #38bdf8; font-weight: 700;">₹${parseFloat(evt.gross_revenue).toFixed(2)}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-outline btn-sm" onclick="app.openEditEventModal(${evt.id})">Edit</button>
                  <button class="btn btn-danger btn-sm" onclick="app.deleteEvent(${evt.id})">Delete</button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }

      // Render recent attendees table
      const attendeesTbody = document.getElementById('organizer-attendees-tbody');
      if (!recentAttendees || recentAttendees.length === 0) {
        attendeesTbody.innerHTML = `<tr><td colspan="7" class="text-center">No reservations made yet for your events.</td></tr>`;
      } else {
        attendeesTbody.innerHTML = recentAttendees.map(att => `
          <tr>
            <td><span class="pass-code-pill">${att.booking_code}</span></td>
            <td><strong>${this.escapeHtml(att.attendee_name)}</strong><br><small class="text-muted">${this.escapeHtml(att.attendee_email)}</small></td>
            <td>${this.escapeHtml(att.event_title)}</td>
            <td>${this.escapeHtml(att.ticket_name)}</td>
            <td>${att.quantity}</td>
            <td style="color: #38bdf8;">₹${parseFloat(att.total_price).toFixed(2)}</td>
            <td><small>${new Date(att.created_at).toLocaleDateString()}</small></td>
          </tr>
        `).join('');
      }
    } catch (err) {
      this.showToast('Failed to load organizer dashboard: ' + err.message, 'error');
    }
  },

  openCreateEventModal() {
    document.getElementById('event-form-title').textContent = 'Create New Event';
    document.getElementById('btn-save-event').textContent = 'Publish Event';
    document.getElementById('event-form-id').value = '';
    document.getElementById('form-event').reset();

    // Default dates
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 14);
    document.getElementById('evt-date').value = tomorrow.toISOString().split('T')[0];
    document.getElementById('evt-time').value = '07:00 PM';

    document.getElementById('modal-event-form').classList.add('active');
  },

  async openEditEventModal(eventId) {
    try {
      const res = await this.api(`/api/events/${eventId}`);
      const evt = res.event;

      document.getElementById('event-form-title').textContent = 'Edit Event Details';
      document.getElementById('btn-save-event').textContent = 'Save Changes';
      document.getElementById('event-form-id').value = evt.id;

      document.getElementById('evt-title').value = evt.title;
      document.getElementById('evt-category').value = evt.category;
      document.getElementById('evt-date').value = evt.date;
      document.getElementById('evt-time').value = evt.time;
      document.getElementById('evt-venue').value = evt.venue;
      document.getElementById('evt-image').value = evt.image_url || '';
      document.getElementById('evt-desc').value = evt.description;

      const ga = evt.tickets.find(t => t.name === 'General Admission');
      const vip = evt.tickets.find(t => t.name === 'VIP Access');

      if (ga) {
        document.getElementById('evt-ga-price').value = ga.price;
        document.getElementById('evt-ga-seats').value = ga.total_seats;
      }
      if (vip) {
        document.getElementById('evt-vip-price').value = vip.price;
        document.getElementById('evt-vip-seats').value = vip.total_seats;
      }

      document.getElementById('modal-event-form').classList.add('active');
    } catch (err) {
      this.showToast('Failed to load event for editing: ' + err.message, 'error');
    }
  },

  async handleSaveEvent(e) {
    e.preventDefault();
    const eventId = document.getElementById('event-form-id').value;

    const payload = {
      title: document.getElementById('evt-title').value.trim(),
      category: document.getElementById('evt-category').value,
      date: document.getElementById('evt-date').value,
      time: document.getElementById('evt-time').value.trim(),
      venue: document.getElementById('evt-venue').value.trim(),
      image_url: document.getElementById('evt-image').value.trim(),
      description: document.getElementById('evt-desc').value.trim(),
      ga_price: parseFloat(document.getElementById('evt-ga-price').value),
      ga_seats: parseInt(document.getElementById('evt-ga-seats').value),
      vip_price: parseFloat(document.getElementById('evt-vip-price').value),
      vip_seats: parseInt(document.getElementById('evt-vip-seats').value)
    };

    try {
      if (eventId) {
        await this.api(`/api/events/${eventId}`, 'PUT', payload);
        this.showToast('Event updated successfully!', 'success');
      } else {
        await this.api('/api/events', 'POST', payload);
        this.showToast('Event published successfully!', 'success');
      }

      this.closeModals();
      if (this.activeView === 'organizer') this.fetchOrganizerDashboard();
      this.fetchEvents();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event? This will remove all associated ticket tiers and bookings.')) {
      return;
    }

    try {
      const res = await this.api(`/api/events/${eventId}`, 'DELETE');
      this.showToast(res.message, 'success');
      if (this.activeView === 'organizer') this.fetchOrganizerDashboard();
      if (this.activeView === 'admin') this.fetchAdminDashboard();
      this.fetchEvents();
    } catch (err) {
      this.showToast('Failed to delete event: ' + err.message, 'error');
    }
  },

  // -----------------------------------------------------------
  // ADMIN DASHBOARD & GOVERNANCE
  // -----------------------------------------------------------
  async fetchAdminDashboard() {
    try {
      const res = await this.api('/api/admin/stats');
      const { summary, users, events } = res;

      // Stats
      document.getElementById('admin-stat-users').textContent = summary.total_users;
      document.getElementById('admin-stat-events').textContent = summary.total_events;
      document.getElementById('admin-stat-tickets').textContent = summary.total_tickets_sold;
      document.getElementById('admin-stat-revenue').textContent = `₹${parseFloat(summary.total_revenue).toFixed(2)}`;

      // Render Users Table
      const usersTbody = document.getElementById('admin-users-tbody');
      usersTbody.innerHTML = users.map(u => `
        <tr>
          <td>#${u.id}</td>
          <td><strong>${this.escapeHtml(u.name)}</strong></td>
          <td>${this.escapeHtml(u.email)}</td>
          <td><span class="badge-role badge-${u.role}">${u.role}</span></td>
          <td><small>${new Date(u.created_at).toLocaleDateString()}</small></td>
          <td>
            ${u.id === this.currentUser.id ? '<small class="text-muted">Current User</small>' : `
              <button class="btn btn-danger btn-sm" onclick="app.adminDeleteUser(${u.id}, '${this.escapeHtml(u.name)}')">Delete</button>
            `}
          </td>
        </tr>
      `).join('');

      // Render Events Table
      const eventsTbody = document.getElementById('admin-events-tbody');
      eventsTbody.innerHTML = events.map(evt => `
        <tr>
          <td>#${evt.id}</td>
          <td><strong>${this.escapeHtml(evt.title)}</strong></td>
          <td>${this.escapeHtml(evt.organizer_name || 'Organizer #' + evt.organizer_id)}</td>
          <td><span class="badge-category">${this.escapeHtml(evt.category)}</span></td>
          <td>${this.escapeHtml(evt.date)}</td>
          <td style="color: #38bdf8; font-weight: 700;">₹${parseFloat(evt.event_revenue).toFixed(2)}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="app.deleteEvent(${evt.id})">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      this.showToast('Failed to load admin panel: ' + err.message, 'error');
    }
  },

  async adminDeleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete user "${userName}"? All their events or bookings will also be deleted.`)) {
      return;
    }

    try {
      const res = await this.api(`/api/admin/users/${userId}`, 'DELETE');
      this.showToast(res.message, 'success');
      this.fetchAdminDashboard();
    } catch (err) {
      this.showToast('Failed to delete user: ' + err.message, 'error');
    }
  },

  // -----------------------------------------------------------
  // TOAST NOTIFICATIONS & UTILITIES
  // -----------------------------------------------------------
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    else if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Bootstrap application on page load
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
