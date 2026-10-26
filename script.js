/**
 * script.js - Eventify Client-Side Application Controller
 * Handles SPA navigation, real-time REST API integration, authentication,
 * fair 10-minute ticket holds, Indian Rupee (₹) payment simulation (UPI & RuPay),
 * and multi-tenant dashboards.
 *
 * Includes an automated Client-Side Engine fallback so the app works seamlessly
 * both when connected to Node.js/Express backend AND when hosted statically on GitHub Pages!
 */

const app = {
  // Application State
  currentUser: null,
  token: localStorage.getItem('eventify_token') || null,
  events: [],
  selectedCategory: 'All',
  searchQuery: '',
  activeView: 'explore',
  isStaticMode: false,
  checkedStatic: false,

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
  // REST API WRAPPER WITH GITHUB PAGES STATIC FALLBACK
  // -----------------------------------------------------------
  async api(endpoint, method = 'GET', data = null) {
    if (this.isStaticMode) {
      return localBackend.handle(endpoint, method, data, this.currentUser);
    }

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
      if (response.status === 404 && !this.checkedStatic) {
        // Running on GitHub Pages or static host where backend API server is absent
        console.log('🌐 Static host detected (e.g. GitHub Pages). Enabling built-in Client-Side Engine.');
        this.isStaticMode = true;
        this.checkedStatic = true;
        localBackend.init();
        return localBackend.handle(endpoint, method, data, this.currentUser);
      }
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || `Request failed with status ${response.status}`);
      }
      return json;
    } catch (err) {
      if (!this.checkedStatic) {
        console.log('🌐 Backend unreachable. Switching to built-in Client-Side Engine for GitHub Pages.');
        this.isStaticMode = true;
        this.checkedStatic = true;
        localBackend.init();
        return localBackend.handle(endpoint, method, data, this.currentUser);
      }
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
      const availableSeats = evt.total_available_seats !== undefined ? evt.total_available_seats : (evt.tickets ? evt.tickets.reduce((sum, t) => sum + (t.available_seats || 0), 0) : 0);
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

      const minPrice = evt.min_price !== undefined ? parseFloat(evt.min_price).toFixed(2) : (gaTicket ? gaTicket.price.toFixed(2) : '0.00');

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

            <!-- Dual Tier Badges in INR -->
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

      // Render confirmation receipt in INR
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
              <td style="color: #38bdf8; font-weight: 700;">₹${parseFloat(evt.gross_revenue || 0).toFixed(2)}</td>
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
    document.getElementById('evt-ga-price').value = '499.00';
    document.getElementById('evt-vip-price').value = '1499.00';

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
          <td style="color: #38bdf8; font-weight: 700;">₹${parseFloat(evt.event_revenue || 0).toFixed(2)}</td>
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

// =============================================================
// CLIENT-SIDE ENGINE (FOR GITHUB PAGES STATIC DEPLOYMENT)
// Automatically handles API endpoints when running on static hosts!
// =============================================================
const localBackend = {
  db: null,

  init() {
    const saved = localStorage.getItem('eventify_client_db_v2');
    if (saved) {
      try {
        this.db = JSON.parse(saved);
        return;
      } catch (e) {}
    }

    // Default Seed Data
    this.db = {
      users: [
        { id: 1, name: 'Platform Admin', email: 'admin@eventify.com', password: 'admin123', role: 'admin', created_at: new Date().toISOString() },
        { id: 2, name: 'Sarah Jenkins (Nexus Events)', email: 'sarah@nexusevents.com', password: 'organizer123', role: 'organizer', created_at: new Date().toISOString() },
        { id: 3, name: 'Marcus Vance (Pulse Productions)', email: 'marcus@pulseproductions.com', password: 'organizer123', role: 'organizer', created_at: new Date().toISOString() },
        { id: 4, name: 'Alex Rivera', email: 'alex.attendee@gmail.com', password: 'attendee123', role: 'attendee', created_at: new Date().toISOString() },
        { id: 5, name: 'Elena Rostova', email: 'elena.r@gmail.com', password: 'attendee123', role: 'attendee', created_at: new Date().toISOString() }
      ],
      events: [
        {
          id: 1,
          organizer_id: 2,
          title: 'National Cloud & Technology Summit 2026',
          description: 'Join engineers, software developers, and cloud architects for two days of technical talks, system design sessions, and hands-on workshops on distributed systems, DevOps, and scalable web engineering.',
          category: 'Tech',
          date: '2026-11-14',
          time: '09:00 AM',
          venue: 'Metropolis Convention Center, Hall A (Bengaluru, KA)',
          image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 101, event_id: 1, name: 'General Admission', price: 1499.00, total_seats: 150, available_seats: 142, perks: 'Full stage access, lunch voucher, digital certificate' },
            { id: 102, event_id: 1, name: 'VIP Access', price: 4999.00, total_seats: 40, available_seats: 37, perks: 'Front-row seating, VIP lounge buffet, 1-on-1 speaker mixer' }
          ]
        },
        {
          id: 2,
          organizer_id: 3,
          title: 'Neon Odyssey: Electronic Music & Lights Festival',
          description: 'An unforgettable night under neon laser canopies featuring world-class synthwave, melodic bass, and house DJs, accompanied by synchronized 3D drone choreography.',
          category: 'Music',
          date: '2026-11-21',
          time: '07:30 PM',
          venue: 'Skyline Waterfront Arena (Mumbai, MH)',
          image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 201, event_id: 2, name: 'General Admission', price: 999.00, total_seats: 300, available_seats: 285, perks: 'Entry to main grounds, LED wristband' },
            { id: 202, event_id: 2, name: 'VIP Access', price: 2499.00, total_seats: 60, available_seats: 55, perks: 'Express security lane, elevated viewing deck, 2 drink tokens' }
          ]
        },
        {
          id: 3,
          organizer_id: 2,
          title: 'Full-Stack Modern Web & DevOps Masterclass',
          description: 'Level up your engineering skills. Build real-time microservices, deploy resilient Docker containers, and master serverless architectures in an intensive hands-on lab.',
          category: 'Workshop',
          date: '2026-11-28',
          time: '10:00 AM',
          venue: 'TechHub Innovation Lab, Hitech City (Hyderabad, TS)',
          image_url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 301, event_id: 3, name: 'General Admission', price: 499.00, total_seats: 50, available_seats: 45, perks: 'Interactive workshop seat, GitHub repo source code, cloud sandbox credits' },
            { id: 302, event_id: 3, name: 'VIP Access', price: 1299.00, total_seats: 15, available_seats: 12, perks: '1-hour resume review with Senior Lead Engineer, premium swag bag' }
          ]
        },
        {
          id: 4,
          organizer_id: 3,
          title: 'City Lights 10K Twilight Run & Health Expo',
          description: 'Lace up your running shoes for an evening charity race through scenic riverside bridges followed by live acoustic bands, healthy smoothie bars, and wellness booths.',
          category: 'Sports',
          date: '2026-12-05',
          time: '05:00 PM',
          venue: 'Bayside Marina Promenade (Chennai, TN)',
          image_url: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 401, event_id: 4, name: 'General Admission', price: 399.00, total_seats: 200, available_seats: 188, perks: 'Official race bib, finisher medal, isotonic hydration packs' },
            { id: 402, event_id: 4, name: 'VIP Access', price: 899.00, total_seats: 30, available_seats: 27, perks: 'Premium moisture-wicking runner jersey, gear storage tent, recovery massage' }
          ]
        },
        {
          id: 5,
          organizer_id: 2,
          title: 'Laugh Out Loud: Comedy All-Stars Live',
          description: 'Prepare your abs for an evening of gut-busting humor featuring five top touring stand-up comedians fresh off specials and viral comedy clips.',
          category: 'Comedy',
          date: '2026-12-12',
          time: '08:00 PM',
          venue: 'The Royale Auditorium, Connaught Place (New Delhi, DL)',
          image_url: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 501, event_id: 5, name: 'General Admission', price: 599.00, total_seats: 120, available_seats: 110, perks: 'Standard cabaret table seating, complimentary popcorn' },
            { id: 502, event_id: 5, name: 'VIP Access', price: 1499.00, total_seats: 25, available_seats: 22, perks: 'Front table right near stage, artist meet-and-greet photo op' }
          ]
        },
        {
          id: 6,
          organizer_id: 3,
          title: 'Founder Pitch Night & Angel Investor Mixer',
          description: 'Where visionary founders meet active angel syndicates and venture capitalists. Eight curated pre-seed and seed startups pitch live on stage followed by open networking.',
          category: 'Networking',
          date: '2026-12-18',
          time: '06:00 PM',
          venue: 'WeWork Galaxy, Residency Road (Bengaluru, KA)',
          image_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1000&q=80',
          created_at: new Date().toISOString(),
          tickets: [
            { id: 601, event_id: 6, name: 'General Admission', price: 799.00, total_seats: 80, available_seats: 74, perks: 'Pitch showcase attendance, networking directory, complimentary hors d’oeuvres' },
            { id: 602, event_id: 6, name: 'VIP Access', price: 2199.00, total_seats: 20, available_seats: 18, perks: 'Private investor dinner lounge, startup deck lookbook, founder direct intros' }
          ]
        }
      ],
      bookings: [
        {
          id: 1,
          booking_code: 'EVT-882194',
          user_id: 4,
          event_id: 1,
          ticket_type_id: 101,
          quantity: 2,
          unit_price: 1499.00,
          total_price: 2998.00,
          attendee_name: 'Alex Rivera',
          attendee_email: 'alex.attendee@gmail.com',
          payment_status: 'completed',
          payment_reference: 'PAY-MOCK-991204',
          created_at: new Date().toISOString()
        }
      ],
      holds: []
    };
    this.save();
  },

  save() {
    localStorage.setItem('eventify_client_db_v2', JSON.stringify(this.db));
  },

  async handle(endpoint, method, data, currentUser) {
    const url = new URL(endpoint, 'http://localhost');
    const path = url.pathname;
    const searchParams = url.searchParams;

    // 1. Auth Login
    if (path === '/api/auth/login' && method === 'POST') {
      const u = this.db.users.find(x => x.email.toLowerCase() === data.email.toLowerCase() && x.password === data.password);
      if (!u) throw new Error('Invalid email or password.');
      const user = { id: u.id, name: u.name, email: u.email, role: u.role };
      return { message: 'Login successful!', user, token: 'demo-token-' + u.id };
    }

    // 2. Auth Register
    if (path === '/api/auth/register' && method === 'POST') {
      const exists = this.db.users.find(x => x.email.toLowerCase() === data.email.toLowerCase());
      if (exists) throw new Error('Email already registered.');
      const newUser = {
        id: Date.now(),
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        password: data.password,
        role: data.role || 'attendee',
        created_at: new Date().toISOString()
      };
      this.db.users.push(newUser);
      this.save();
      const user = { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role };
      return { message: 'Account registered successfully!', user, token: 'demo-token-' + newUser.id };
    }

    // 3. Auth Me
    if (path === '/api/auth/me') {
      if (!currentUser) throw new Error('Not authenticated.');
      return { user: currentUser };
    }

    // 4. Get Events List
    if (path === '/api/events' && method === 'GET') {
      const search = (searchParams.get('search') || '').toLowerCase();
      const cat = searchParams.get('category');

      let list = this.db.events.filter(e => {
        if (cat && cat !== 'All' && e.category !== cat) return false;
        if (search) {
          const text = `${e.title} ${e.description} ${e.venue}`.toLowerCase();
          if (!text.includes(search)) return false;
        }
        return true;
      });

      list = list.map(e => {
        const ga = e.tickets.find(t => t.name === 'General Admission') || e.tickets[0];
        const vip = e.tickets.find(t => t.name === 'VIP Access') || e.tickets[1];
        const minPrice = ga ? ga.price : 0;
        const totalAvail = e.tickets.reduce((s, t) => s + (t.available_seats || 0), 0);
        return {
          ...e,
          min_price: minPrice,
          total_available_seats: totalAvail
        };
      });

      return { events: list };
    }

    // 5. Get Single Event
    const singleEventMatch = path.match(/^\/api\/events\/(\d+)$/);
    if (singleEventMatch && method === 'GET') {
      const id = parseInt(singleEventMatch[1]);
      const evt = this.db.events.find(x => x.id === id);
      if (!evt) throw new Error('Event not found.');
      return { event: evt };
    }

    // 6. Create Event
    if (path === '/api/events' && method === 'POST') {
      const newId = Date.now();
      const newEvt = {
        id: newId,
        organizer_id: currentUser ? currentUser.id : 2,
        title: data.title,
        description: data.description,
        category: data.category,
        date: data.date,
        time: data.time,
        venue: data.venue,
        image_url: data.image_url || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1000&q=80',
        created_at: new Date().toISOString(),
        tickets: [
          { id: newId + 1, event_id: newId, name: 'General Admission', price: data.ga_price, total_seats: data.ga_seats, available_seats: data.ga_seats, perks: 'Standard event entrance & seating' },
          { id: newId + 2, event_id: newId, name: 'VIP Access', price: data.vip_price, total_seats: data.vip_seats, available_seats: data.vip_seats, perks: 'Front-row access, priority check-in, exclusive lounge' }
        ]
      };
      this.db.events.unshift(newEvt);
      this.save();
      return { message: 'Event created successfully!', eventId: newId };
    }

    // 7. Update Event
    if (singleEventMatch && method === 'PUT') {
      const id = parseInt(singleEventMatch[1]);
      const evt = this.db.events.find(x => x.id === id);
      if (!evt) throw new Error('Event not found.');
      evt.title = data.title || evt.title;
      evt.category = data.category || evt.category;
      evt.date = data.date || evt.date;
      evt.time = data.time || evt.time;
      evt.venue = data.venue || evt.venue;
      evt.description = data.description || evt.description;
      evt.image_url = data.image_url || evt.image_url;
      this.save();
      return { message: 'Event updated successfully!' };
    }

    // 8. Delete Event
    if (singleEventMatch && method === 'DELETE') {
      const id = parseInt(singleEventMatch[1]);
      this.db.events = this.db.events.filter(x => x.id !== id);
      this.db.bookings = this.db.bookings.filter(x => x.event_id !== id);
      this.save();
      return { message: 'Event deleted successfully.' };
    }

    // 9. Hold Tickets (10-minute hold)
    if (path === '/api/bookings/hold' && method === 'POST') {
      let foundTicket = null;
      let foundEvent = null;
      for (const e of this.db.events) {
        const t = e.tickets.find(x => x.id === data.ticket_type_id);
        if (t) { foundTicket = t; foundEvent = e; break; }
      }
      if (!foundTicket) throw new Error('Ticket tier not found.');
      if (foundTicket.available_seats < data.quantity) throw new Error('Not enough seats available.');

      const holdToken = 'HOLD-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = Date.now() + 10 * 60 * 1000;
      this.db.holds.push({ holdToken, ticket_type_id: foundTicket.id, quantity: data.quantity, expiresAt });
      this.save();
      return {
        message: 'Seats reserved for 10 minutes!',
        holdToken,
        expiresAt,
        totalPrice: foundTicket.price * data.quantity
      };
    }

    // 10. Release Hold
    const holdMatch = path.match(/^\/api\/bookings\/hold\/(.+)$/);
    if (holdMatch && method === 'DELETE') {
      this.db.holds = this.db.holds.filter(x => x.holdToken !== holdMatch[1]);
      this.save();
      return { message: 'Seat hold released.' };
    }

    // 11. Checkout / Finalize Payment
    if (path === '/api/bookings/checkout' && method === 'POST') {
      if (data.simulate_failure) {
        throw new Error('Mock Payment Declined: Simulated transaction failure (e.g. insufficient funds / bank decline). Your hold is still active — you may retry payment.');
      }

      let foundTicket = null;
      let foundEvent = null;
      for (const e of this.db.events) {
        const t = e.tickets.find(x => x.id === data.ticket_type_id);
        if (t) { foundTicket = t; foundEvent = e; break; }
      }
      if (!foundTicket) throw new Error('Ticket tier not found.');
      if (foundTicket.available_seats < data.quantity) throw new Error('Seats no longer available.');

      foundTicket.available_seats -= data.quantity;
      const bookingCode = 'EVT-' + Math.floor(100000 + Math.random() * 900000);
      const paymentRef = 'PAY-MOCK-' + Math.floor(10000000 + Math.random() * 90000000);
      const total = foundTicket.price * data.quantity;

      const newBooking = {
        id: Date.now(),
        booking_code: bookingCode,
        user_id: currentUser ? currentUser.id : 4,
        event_id: foundEvent.id,
        ticket_type_id: foundTicket.id,
        quantity: data.quantity,
        unit_price: foundTicket.price,
        total_price: total,
        attendee_name: data.attendee_name,
        attendee_email: data.attendee_email,
        payment_status: 'completed',
        payment_reference: paymentRef,
        created_at: new Date().toISOString(),
        event_title: foundEvent.title,
        event_date: foundEvent.date,
        event_time: foundEvent.time,
        event_venue: foundEvent.venue,
        ticket_name: foundTicket.name
      };

      this.db.bookings.unshift(newBooking);
      this.save();

      return {
        message: 'Booking confirmed successfully!',
        booking: newBooking
      };
    }

    // 12. My Bookings
    if (path === '/api/bookings/my') {
      const uid = currentUser ? currentUser.id : 4;
      const my = this.db.bookings.filter(b => b.user_id === uid).map(b => {
        const evt = this.db.events.find(e => e.id === b.event_id) || {};
        return {
          ...b,
          event_title: b.event_title || evt.title,
          event_date: b.event_date || evt.date,
          event_time: b.event_time || evt.time,
          event_venue: b.event_venue || evt.venue,
          ticket_name: b.ticket_name || 'General Admission'
        };
      });
      return { bookings: my };
    }

    // 13. Cancel Booking
    const cancelMatch = path.match(/^\/api\/bookings\/(\d+)$/);
    if (cancelMatch && method === 'DELETE') {
      const id = parseInt(cancelMatch[1]);
      const b = this.db.bookings.find(x => x.id === id);
      if (b) {
        for (const e of this.db.events) {
          const t = e.tickets.find(x => x.id === b.ticket_type_id);
          if (t) { t.available_seats += b.quantity; break; }
        }
        this.db.bookings = this.db.bookings.filter(x => x.id !== id);
        this.save();
      }
      return { message: 'Booking canceled successfully and seats returned to inventory.' };
    }

    // 14. Organizer Stats
    if (path === '/api/organizer/stats') {
      const orgId = currentUser ? currentUser.id : 2;
      const orgEvents = this.db.events.filter(e => e.organizer_id === orgId || currentUser?.role === 'admin');
      let totalTickets = 0;
      let totalRevenue = 0;
      let totalBookings = 0;

      const eventsWithMetrics = orgEvents.map(e => {
        const evBookings = this.db.bookings.filter(b => b.event_id === e.id);
        const evRev = evBookings.reduce((s, b) => s + b.total_price, 0);
        const evTickets = evBookings.reduce((s, b) => s + b.quantity, 0);
        totalTickets += evTickets;
        totalRevenue += evRev;
        totalBookings += evBookings.length;
        return {
          ...e,
          gross_revenue: evRev,
          tickets_sold: evTickets,
          total_bookings: evBookings.length
        };
      });

      const attendees = this.db.bookings
        .filter(b => orgEvents.some(e => e.id === b.event_id))
        .slice(0, 10);

      return {
        summary: {
          total_events: orgEvents.length,
          total_bookings: totalBookings,
          total_tickets_sold: totalTickets,
          total_revenue: totalRevenue
        },
        events: eventsWithMetrics,
        recentAttendees: attendees
      };
    }

    // 15. Admin Stats
    if (path === '/api/admin/stats') {
      const totalUsers = this.db.users.length;
      const totalEvents = this.db.events.length;
      const totalTickets = this.db.bookings.reduce((s, b) => s + b.quantity, 0);
      const totalRevenue = this.db.bookings.reduce((s, b) => s + b.total_price, 0);

      const eventsWithMetrics = this.db.events.map(e => {
        const evBookings = this.db.bookings.filter(b => b.event_id === e.id);
        const evRev = evBookings.reduce((s, b) => s + b.total_price, 0);
        const org = this.db.users.find(u => u.id === e.organizer_id);
        return {
          ...e,
          organizer_name: org ? org.name : 'Organizer #' + e.organizer_id,
          event_revenue: evRev
        };
      });

      return {
        summary: {
          total_users: totalUsers,
          total_events: totalEvents,
          total_tickets_sold: totalTickets,
          total_revenue: totalRevenue
        },
        users: this.db.users,
        events: eventsWithMetrics
      };
    }

    // 16. Admin Delete User
    const delUserMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (delUserMatch && method === 'DELETE') {
      const uid = parseInt(delUserMatch[1]);
      this.db.users = this.db.users.filter(x => x.id !== uid);
      this.save();
      return { message: 'User deleted successfully.' };
    }

    throw new Error('Endpoint not found');
  }
};

// Bootstrap application on page load
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
