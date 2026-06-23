const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const MENU_PATH = path.join(__dirname, 'data', 'menu.json');

// Middleware
app.use(cors());
app.use(express.json());

// Serve static documentation page from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
const mongoUrl = process.env.mongodb_url;
if (!mongoUrl) {
  console.error("CRITICAL ERROR: mongodb_url is not defined in .env file!");
  process.exit(1);
}

mongoose.connect(mongoUrl)
  .then(() => {
    console.log("=================================================");
    console.log("🍃 Connected to MongoDB cluster successfully.");
    console.log("=================================================");
    seedMenuIfNeeded();
  })
  .catch(err => {
    console.error("Error connecting to MongoDB cluster:", err);
  });

// ==========================================
// MONGOOSE SCHEMAS & MODELS
// ==========================================

// 1. Menu Schema
const MenuSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String, required: true },
  description: { type: String, required: true },
  rating: { type: Number, default: 5 },
  badge: { type: String, default: "" },
  views: { type: Number, default: 0 }
});
const Menu = mongoose.model('Menu', MenuSchema);

// 2. Reservation Schema
const ReservationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  date: { type: String, required: true },
  status: { type: String, default: 'Pending', enum: ['Pending', 'Confirmed', 'Cancelled'] }
});
const Reservation = mongoose.model('Reservation', ReservationSchema);

// 3. Order Schema
const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true }
  },
  items: [
    {
      id: { type: Number, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true },
      total: { type: Number, required: true }
    }
  ],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, default: 150 },
  grandTotal: { type: Number, required: true },
  payment: { type: String, default: 'Cash on Delivery' },
  billing: { type: String, default: '' },
  date: { type: String, required: true }
});
const Order = mongoose.model('Order', OrderSchema);

// 4. Admin Account Schema
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', AdminSchema);

// Auto-seed function to populate menu items from local JSON if empty
async function seedMenuIfNeeded() {
  try {
    const count = await Menu.countDocuments();
    if (count === 0) {
      console.log("Database 'menus' collection is empty. Auto-seeding from local data/menu.json...");
      if (fs.existsSync(MENU_PATH)) {
        const fileData = fs.readFileSync(MENU_PATH, 'utf8');
        const menuItems = JSON.parse(fileData);
        if (menuItems.length > 0) {
          await Menu.insertMany(menuItems);
          console.log(`Auto-seeded ${menuItems.length} dishes into MongoDB.`);
        }
      } else {
        console.warn("Local data/menu.json file not found, cannot seed.");
      }
    }
  } catch (error) {
    console.error("Error auto-seeding Menu collection:", error);
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
app.get('/api/menu', async (req, res) => {
  const { category, search } = req.query;
  try {
    let query = {};
    if (category && category.toLowerCase() !== 'all') {
      query.category = { $regex: new RegExp('^' + category + '$', 'i') };
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    const menu = await Menu.find(query);
    res.status(200).json(menu);
  } catch (error) {
    console.error("Error fetching menu from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/menu/:id - Get a single dish
app.get('/api/menu/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    // Increment view counter atomically on fetch
    const item = await Menu.findOneAndUpdate(
      { id: id },
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!item) {
      return res.status(404).json({ error: 'Dish Not Found', message: `Dish with ID ${id} was not found.` });
    }
    res.status(200).json(item);
  } catch (error) {
    console.error("Error fetching dish from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ==========================================
// 2. RESERVATION ENDPOINTS
// ==========================================

// GET /api/reservations - Fetch all reservation requests
app.get('/api/reservations', async (req, res) => {
  const { status, search } = req.query;
  try {
    let query = {};
    if (status && status !== 'All') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }
    const list = await Reservation.find(query).sort({ _id: -1 });
    res.status(200).json(list);
  } catch (error) {
    console.error("Error fetching reservations from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// POST /api/reservations - Submit a new table booking request
app.post('/api/reservations', async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Simple backend inputs validation
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing required reservation fields.' });
  }

  try {
    const newBooking = new Reservation({
      id: 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      date: new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      status: 'Pending'
    });
    await newBooking.save();
    res.status(201).json(newBooking);
  } catch (error) {
    console.error("Error saving reservation to MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// PUT /api/reservations/:id/status - Update reservation status
app.put('/api/reservations/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['Pending', 'Confirmed', 'Cancelled'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Bad Request', message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  try {
    const updated = await Reservation.findOneAndUpdate(
      { id: id },
      { status: status },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Not Found', message: `Reservation with ID ${id} does not exist.` });
    }
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating reservation status in MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// DELETE /api/reservations/:id - Delete a booking record
app.delete('/api/reservations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Reservation.findOneAndDelete({ id: id });
    if (!deleted) {
      return res.status(404).json({ error: 'Not Found', message: `Reservation record does not exist.` });
    }
    res.status(200).json({ message: 'Reservation deleted successfully.', item: deleted });
  } catch (error) {
    console.error("Error deleting reservation from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// DELETE /api/reservations - Clear ALL reservation records
app.delete('/api/reservations', async (req, res) => {
  try {
    await Reservation.deleteMany({});
    res.status(200).json({ success: true, message: 'All reservations deleted successfully.' });
  } catch (error) {
    console.error("Error deleting all reservations from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ==========================================
// 3. CHECKOUT / ORDERS ENDPOINTS
// ==========================================

// POST /api/checkout - Place a new combined order
app.post('/api/checkout', async (req, res) => {
  const { customer, cart, payment, billing } = req.body;

  if (!customer || !cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ error: 'Bad Request', message: 'Shopping cart is empty or fields are missing.' });
  }

  try {
    let subtotal = 0;
    const processedItems = [];

    // Re-calculate pricing server-side to prevent client price spoofing
    for (const cartItem of cart) {
      const dish = await Menu.findOne({ id: Number(cartItem.id) });
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

    const newOrder = new Order({
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
    });

    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (error) {
    console.error("Error placing order in MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/orders - Get all completed orders
app.get('/api/orders', async (req, res) => {
  try {
    const list = await Order.find({}).sort({ _id: -1 });
    res.status(200).json(list);
  } catch (error) {
    console.error("Error fetching orders from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// DELETE /api/orders - Clear ALL order records
app.delete('/api/orders', async (req, res) => {
  try {
    await Order.deleteMany({});
    res.status(200).json({ success: true, message: 'All orders deleted successfully.' });
  } catch (error) {
    console.error("Error deleting all orders from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ==========================================
// 4. ADMIN REGISTRATION & AUTHENTICATION ENDPOINTS
// ==========================================

// POST /api/admin/register - Register a custom admin account in MongoDB
app.post('/api/admin/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing username or password.' });
  }
  try {
    // Check if username is reserved
    if (username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'Bad Request', message: "Username 'admin' is reserved." });
    }
    // Check if username already exists
    const existing = await Admin.findOne({ username: { $regex: new RegExp('^' + username + '$', 'i') } });
    if (existing) {
      return res.status(400).json({ error: 'Conflict', message: 'Username already exists.' });
    }
    const newAdmin = new Admin({
      username: username.trim(),
      password: password
    });
    await newAdmin.save();
    res.status(201).json({ success: true, message: 'Admin account registered successfully.' });
  } catch (error) {
    console.error("Error registering admin account in MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// POST /api/admin/login - Authenticate credentials against MongoDB / superadmin
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Bad Request', message: 'Missing username or password.' });
  }
  try {
    // Check built-in super admin
    if (username.toLowerCase() === 'admin' && password === 'admincelestia') {
      return res.status(200).json({ success: true, token: 'super-admin-token' });
    }
    // Check MongoDB custom accounts
    const match = await Admin.findOne({ 
      username: { $regex: new RegExp('^' + username + '$', 'i') },
      password: password
    });
    if (match) {
      return res.status(200).json({ success: true, token: 'custom-admin-token' });
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid username or password.' });
  } catch (error) {
    console.error("Error logging in admin account in MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// GET /api/admin/accounts - Get list of custom admin usernames (for duplicate checks in frontend if needed)
app.get('/api/admin/accounts', async (req, res) => {
  try {
    const list = await Admin.find({}, 'username');
    res.status(200).json(list);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ==========================================
// 5. ADMIN STATS ENDPOINT
// ==========================================

// GET /api/stats - Dashboard stats summary
app.get('/api/stats', async (req, res) => {
  try {
    const totalBookings = await Reservation.countDocuments();
    const pending = await Reservation.countDocuments({ status: 'Pending' });
    const confirmed = await Reservation.countDocuments({ status: 'Confirmed' });
    const cancelled = await Reservation.countDocuments({ status: 'Cancelled' });
    const totalOrders = await Order.countDocuments();

    res.status(200).json({
      totalBookings,
      pending,
      confirmed,
      cancelled,
      totalOrders
    });
  } catch (error) {
    console.error("Error calculating stats from MongoDB:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`🚀 Celestia Restaurant API running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`=================================================`);
});
