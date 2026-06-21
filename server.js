const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const MENU_PATH = path.join(__dirname, 'data', 'menu.json');
const RESERVATIONS_PATH = path.join(__dirname, 'data', 'reservations.json');
const ORDERS_PATH = path.join(__dirname, 'data', 'orders.json');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static documentation page from public folder
app.use(express.static(path.join(__dirname, 'public')));

// JSON Helper Functions
function readJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([]), 'utf8');
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file: ${filePath}`, error);
    return [];
  }
}

function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Error writing file: ${filePath}`, error);
  }
}

// Simulated Latency Middleware (400ms for realistic loading animations)
const simulateLatency = (req, res, next) => {
  setTimeout(next, 400);
};

app.use('/api', simulateLatency);

// ==========================================
// 1. MENU ENDPOINTS
// ==========================================

// GET /api/menu - Get all dishes (with optional filtering)
app.get('/api/menu', (req, res) => {
  const { category, search } = req.query;
  let menu = readJSON(MENU_PATH);

  if (category && category.toLowerCase() !== 'all') {
    menu = menu.filter(item => item.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const term = search.toLowerCase();
    menu = menu.filter(item => 
      item.name.toLowerCase().includes(term) || 
      item.description.toLowerCase().includes(term)
    );
  }

  res.status(200).json(menu);
});

// GET /api/menu/:id - Get a single dish
app.get('/api/menu/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const menu = readJSON(MENU_PATH);
  const itemIndex = menu.findIndex(i => i.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Dish Not Found', message: `Dish with ID ${id} was not found.` });
  }

  // Increment view counter
  menu[itemIndex].views = (menu[itemIndex].views || 0) + 1;
  writeJSON(MENU_PATH, menu);

  res.status(200).json(menu[itemIndex]);
});

// ==========================================
// 2. RESERVATION ENDPOINTS
// ==========================================

// GET /api/reservations - Fetch all reservation requests
app.get('/api/reservations', (req, res) => {
  const { status, search } = req.query;
  let list = readJSON(RESERVATIONS_PATH);

  if (status && status !== 'All') {
    list = list.filter(r => r.status.toLowerCase() === status.toLowerCase());
  }

  if (search) {
    const term = search.toLowerCase();
    list = list.filter(r => 
      r.name.toLowerCase().includes(term) ||
      r.email.toLowerCase().includes(term) ||
      r.subject.toLowerCase().includes(term) ||
      r.message.toLowerCase().includes(term)
    );
  }

  res.status(200).json(list);
});

// POST /api/reservations - Submit a new table booking request
app.post('/api/reservations', (req, res) => {
  const { name, email, subject, message } = req.body;

  // Simple backend inputs validation
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing required reservation fields.' });
  }

  const reservations = readJSON(RESERVATIONS_PATH);
  const newBooking = {
    id: 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name.trim(),
    email: email.trim(),
    subject: subject.trim(),
    message: message.trim(),
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    status: 'Pending'
  };

  reservations.unshift(newBooking);
  writeJSON(RESERVATIONS_PATH, reservations);

  res.status(201).json(newBooking);
});

// PUT /api/reservations/:id/status - Update reservation status
app.put('/api/reservations/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pending', 'Confirmed', 'Cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Bad Request', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const list = readJSON(RESERVATIONS_PATH);
  const index = list.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Not Found', message: `Reservation with ID ${id} does not exist.` });
  }

  list[index].status = status;
  writeJSON(RESERVATIONS_PATH, list);

  res.status(200).json(list[index]);
});

// DELETE /api/reservations/:id - Delete a booking record
app.delete('/api/reservations/:id', (req, res) => {
  const { id } = req.params;
  const list = readJSON(RESERVATIONS_PATH);
  const index = list.findIndex(r => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Not Found', message: `Reservation record does not exist.` });
  }

  const deletedItem = list.splice(index, 1)[0];
  writeJSON(RESERVATIONS_PATH, list);

  res.status(200).json({ message: 'Reservation deleted successfully.', item: deletedItem });
});

// ==========================================
// 3. CHECKOUT / ORDERS ENDPOINTS
// ==========================================

// POST /api/checkout - Place a new combined order
app.post('/api/checkout', (req, res) => {
  const { customer, cart, payment, billing } = req.body;

  if (!customer || !cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: 'Shopping cart is empty or fields are missing.' });
  }

  const menu = readJSON(MENU_PATH);
  const orders = readJSON(ORDERS_PATH);

  let subtotal = 0;
  const processedItems = [];

  // Re-calculate pricing server-side to prevent client price spoofing
  for (const cartItem of cart) {
    const dish = menu.find(item => item.id === cartItem.id);
    if (!dish) {
      return res.status(404).json({ error: 'Dish Not Found', message: `Dish with ID ${cartItem.id} was not found.` });
    }
    const itemCost = dish.price * cartItem.quantity;
    subtotal += itemCost;
    processedItems.push({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      quantity: cartItem.quantity,
      total: itemCost
    });
  }

  const deliveryFee = 150;
  const grandTotal = subtotal + deliveryFee;
  const orderId = 'cel_' + Math.random().toString(36).substr(2, 9).toUpperCase();

  const newOrder = {
    id: orderId,
    customer: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone
    },
    items: processedItems,
    subtotal,
    deliveryFee,
    grandTotal,
    payment: payment || 'Cash on Delivery',
    billing: billing || '',
    date: new Date().toISOString()
  };

  orders.unshift(newOrder);
  writeJSON(ORDERS_PATH, orders);

  res.status(201).json(newOrder);
});

// GET /api/orders - Get all completed orders
app.get('/api/orders', (req, res) => {
  const orders = readJSON(ORDERS_PATH);
  res.status(200).json(orders);
});

// ==========================================
// 4. ADMIN STATS ENDPOINT
// ==========================================

// GET /api/stats - Dashboard stats summary
app.get('/api/stats', (req, res) => {
  const reservations = readJSON(RESERVATIONS_PATH);
  const orders = readJSON(ORDERS_PATH);

  const totalBookings = reservations.length;
  const pending = reservations.filter(r => r.status === 'Pending').length;
  const confirmed = reservations.filter(r => r.status === 'Confirmed').length;
  const cancelled = reservations.filter(r => r.status === 'Cancelled').length;

  res.status(200).json({
    totalBookings,
    pending,
    confirmed,
    cancelled,
    totalOrders: orders.length
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Celestia Restaurant API running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`=================================================`);
});
