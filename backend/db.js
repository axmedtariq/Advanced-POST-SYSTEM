// backend/db.js

const mysql = require('mysql2/promise'); // ✅ import mysql
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST.split(':')[0], // handle localhost:3306
  port: process.env.DB_HOST.split(':')[1] || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
