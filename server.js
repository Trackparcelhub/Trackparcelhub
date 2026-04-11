// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { sendWhatsAppMessage } = require('./whatsapp-service');
const webhookHandler = require('./webhook-handler');
const shipmentRoutes = require('./shipment-routes');

// Create Express app
const app = express();

// Database connection pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Make db available to routes
app.locals.db = db;

// Middleware
app.use(cors());
app.use(express.json()); // Parse JSON bodies

// Health check endpoint (for Render)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook receiver (couriers send updates here)
app.post('/api/webhook', (req, res) => webhookHandler(req, res, db, sendWhatsAppMessage));

// Merchant & Customer API routes
app.use('/api', shipmentRoutes(db));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database: ${process.env.DATABASE_URL ? 'configured' : 'MISSING'}`);
  console.log(`WAHA URL: ${process.env.WAHA_URL || 'not set'}`);
});
