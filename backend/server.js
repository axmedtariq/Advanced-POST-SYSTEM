require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1d';

// ===== Database Connection (Postgres) =====
const db = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ===== Auth Middleware =====
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ===== Auth Routes =====
// Register
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'Missing fields' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
      [email, hash, role]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Products CRUD =====
app.get('/api/products', authMiddleware, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  try {
    const { name, price, stock } = req.body;
    await db.query('INSERT INTO products (name, price, stock) VALUES ($1, $2, $3)', [
      name,
      price,
      stock,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  try {
    const { id } = req.params;
    const { name, price, stock } = req.body;
    await db.query('UPDATE products SET name=$1, price=$2, stock=$3 WHERE id=$4', [
      name,
      price,
      stock,
      id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  try {
    await db.query('DELETE FROM products WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Checkout =====
app.post('/api/checkout', authMiddleware, async (req, res) => {
  const { items, customer } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Cart empty' });
  if (!customer || !customer.name || !customer.address || !customer.phone)
    return res.status(400).json({ error: 'Customer information required' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let total = 0;

    for (const item of items) {
      const result = await client.query('SELECT stock, price FROM products WHERE id=$1 FOR UPDATE', [
        item.product_id,
      ]);
      if (result.rows.length === 0) throw new Error(`Product ${item.product_id} not found`);
      const prod = result.rows[0];
      if (prod.stock < item.qty) throw new Error(`Not enough stock for product ${item.product_id}`);

      const dbPrice = Number(prod.price);
      total += dbPrice * Number(item.qty);

      // always use DB price, ignore client price
      item.price = dbPrice;

      await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2', [
        item.qty,
        item.product_id,
      ]);
    }

    const saleResult = await client.query(
      'INSERT INTO sales (total, customer_name, customer_address, customer_phone, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
      [total, customer.name, customer.address, customer.phone]
    );
    const saleId = saleResult.rows[0].id;

    for (const item of items) {
      await client.query(
        'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES ($1, $2, $3, $4)',
        [saleId, item.product_id, item.qty, item.price]
      );
    }

    await client.query('COMMIT');
    client.release();
    res.json({ ok: true, sale_id: saleId });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(400).json({ error: err.message });
  }
});

// ===== Sales Reports =====
app.get('/api/sales', authMiddleware, async (req, res) => {
  try {
    // get recent sales
    const salesRes = await db.query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 5');
    const sales = salesRes.rows;
    if (sales.length === 0) return res.json([]);

    // get all items for those sales
    const saleIds = sales.map(s => s.id);
    const itemsRes = await db.query(
      `SELECT si.sale_id, si.product_id, si.qty, si.price, p.name
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ANY($1::int[])`,
      [saleIds]
    );

    const itemsBySale = {};
    for (const row of itemsRes.rows) {
      if (!itemsBySale[row.sale_id]) itemsBySale[row.sale_id] = [];
      itemsBySale[row.sale_id].push({
        product_id: row.product_id,
        name: row.name,
        qty: row.qty,
        price: row.price,
      });
    }

    const withItems = sales.map(s => ({
      ...s,
      items: itemsBySale[s.id] || [],
    }));

    res.json(withItems);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Start Server =====
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
 