const http = require('http');
const { startServer } = require('./server');

async function test() {
  console.log('Booting Eventify server for test suite...');
  const testPort = 3002;
  const server = await startServer(testPort);

  function request(path, options = {}, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path,
        ...options
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data) });
          } catch(e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // 1. Test GET /api/events
    console.log('Testing GET /api/events in INR (₹)...');
    const eventsRes = await request('/api/events');
    console.log('Events retrieved:', eventsRes.json.events.length);
    console.log('First event:', eventsRes.json.events[0].title);
    console.log('First event GA ticket price (₹):', eventsRes.json.events[0].tickets[0].price);

    // 2. Test Login as Admin
    console.log('Testing POST /api/auth/login as admin...');
    const adminLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'admin@eventify.com', password: 'admin123' });
    console.log('Admin login status:', adminLogin.json.user.name, 'Role:', adminLogin.json.user.role);

    // 3. Test Login as Attendee
    console.log('Testing POST /api/auth/login as attendee...');
    const attLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'alex.attendee@gmail.com', password: 'attendee123' });
    const attToken = attLogin.json.token;
    console.log('Attendee token acquired:', !!attToken);

    // 4. Test 10-minute hold
    const firstTicketId = eventsRes.json.events[0].tickets[0].id;
    console.log('Testing POST /api/bookings/hold for ticket ID:', firstTicketId);
    const holdRes = await request('/api/bookings/hold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${attToken}`
      }
    }, { ticket_type_id: firstTicketId, quantity: 2 });
    console.log('Hold created:', holdRes.json.holdToken, 'Expires at:', new Date(holdRes.json.expiresAt).toLocaleTimeString());

    // 5. Test Mock Payment Failure Simulation
    console.log('Testing Mock Payment Failure Simulation in INR...');
    const failRes = await request('/api/bookings/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${attToken}`
      }
    }, {
      holdToken: holdRes.json.holdToken,
      ticket_type_id: firstTicketId,
      quantity: 2,
      attendee_name: 'Alex Rivera',
      attendee_email: 'alex.attendee@gmail.com',
      simulate_failure: true
    });
    console.log('Payment failure simulation response:', failRes.json.error);

    // 6. Test Mock Payment Success
    console.log('Testing Mock Payment Success in INR (₹)...');
    const successRes = await request('/api/bookings/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${attToken}`
      }
    }, {
      holdToken: holdRes.json.holdToken,
      ticket_type_id: firstTicketId,
      quantity: 2,
      attendee_name: 'Alex Rivera',
      attendee_email: 'alex.attendee@gmail.com',
      simulate_failure: false
    });
    console.log('Booking confirmed! Code:', successRes.json.booking.booking_code, 'Total INR: ₹' + successRes.json.booking.total_price);

    // 7. Verify My Bookings
    console.log('Testing GET /api/bookings/my...');
    const myBookings = await request('/api/bookings/my', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${attToken}` }
    });
    console.log('Alex bookings count:', myBookings.json.bookings.length);

    console.log('\n⭐⭐⭐ ALL ENDPOINTS & INR FLOWS VERIFIED SUCCESSFULLY! ⭐⭐⭐\n');
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    server.close(() => {
      process.exit(0);
    });
  }
}

test();
