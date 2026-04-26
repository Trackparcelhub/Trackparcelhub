// shipment-routes.js
// API endpoints for merchant dashboard and customer portal

const { v4: uuidv4 } = require('uuid');

function shipmentRoutes(db) {
  const router = require('express').Router();

  // ---------- MERCHANT ENDPOINTS ----------

  // GET /api/shipments - list all shipments for a merchant (using merchant_id from header or query)
  router.get('/shipments', async (req, res) => {
    try {
      const merchantId = req.headers['x-merchant-id'] || req.query.merchant_id;
      if (!merchantId) {
        return res.status(400).json({ error: ' Please provide Merchant Id Its Missing' });
      }

      const { courier, status, fromDate, toDate } = req.query;
      let query = 'SELECT * FROM shipments WHERE merchant_id = $1';
      const params = [merchantId];
      let idx = 2;

      if (courier) {
        query += ` AND courier = $${idx++}`;
        params.push(courier);
      }
      if (status) {
        query += ` AND current_status = $${idx++}`;
        params.push(status);
      }
      if (fromDate) {
        query += ` AND created_at >= $${idx++}`;
        params.push(fromDate);
      }
      if (toDate) {
        query += ` AND created_at <= $${idx++}`;
        params.push(toDate);
      }

      query += ' ORDER BY created_at DESC';
      const result = await db.query(query, params);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Database error' });
    }
  });

  // POST /api/shipments - create new shipment
  router.post('/shipments', async (req, res) => {
    try {
      const { merchant_id, customer_name, customer_phone, address, courier, cod_amount, product_details, weight } = req.body;

      if (!merchant_id || !customer_phone || !address || !courier) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Generate a unique tracking ID (could call real courier API, but for demo we generate)
      const trackingId = `${courier.substring(0, 3)}-${uuidv4().slice(0, 8)}`.toUpperCase();

      // Insert into shipments table (assuming customers table is separate, but we simplify)
      const result = await db.query(
        `INSERT INTO shipments 
         (tracking_id, merchant_id, customer_name, customer_phone, delivery_address, courier, cod_amount, product_details, weight, current_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [trackingId, merchant_id, customer_name, customer_phone, address, courier, cod_amount || 0, product_details || null, weight || null, 'booked']
      );

      // Optionally send WhatsApp notification for booking
      // (You could call sendWhatsAppMessage here if you want to notify immediately)

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to create shipment' });
    }
  });

  // GET /api/shipments/:id - get single shipment
  router.get('/shipments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await db.query('SELECT * FROM shipments WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shipment not found' });
      }
      // Also fetch status history
      const history = await db.query('SELECT * FROM status_history WHERE shipment_id = $1 ORDER BY created_at ASC', [id]);
      res.json({ ...result.rows[0], history: history.rows });
    } catch (error) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // PUT /api/shipments/:id/status - manually update status (merchant action)
  router.put('/shipments/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'Missing status' });

      const shipment = await db.query('SELECT current_status FROM shipments WHERE id = $1', [id]);
      if (shipment.rows.length === 0) return res.status(404).json({ error: 'Not found' });

      const oldStatus = shipment.rows[0].current_status;
      await db.query('UPDATE shipments SET current_status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
      await db.query(
        'INSERT INTO status_history (shipment_id, old_status, new_status, created_at) VALUES ($1, $2, $3, NOW())',
        [id, oldStatus, status]
      );

      res.json({ message: 'Status updated', id, oldStatus, newStatus: status });
    } catch (error) {
      res.status(500).json({ error: 'Update failed' });
    }
  });

  // ---------- CUSTOMER PORTAL ENDPOINTS (public) ----------

  // GET /api/public/track/:trackingId
  router.get('/public/track/:trackingId', async (req, res) => {
    try {
      const { trackingId } = req.params;
      const result = await db.query('SELECT * FROM shipments WHERE tracking_id = $1', [trackingId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Parcel not found' });
      }
      const shipment = result.rows[0];
      const history = await db.query('SELECT * FROM status_history WHERE shipment_id = $1 ORDER BY created_at ASC', [shipment.id]);
      res.json({ ...shipment, history: history.rows });
    } catch (error) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  // GET /api/public/track/by-phone/:phone
  router.get('/public/track/by-phone/:phone', async (req, res) => {
    try {
      const { phone } = req.params;
      // Normalize phone number (remove spaces, dashes)
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      const result = await db.query('SELECT * FROM shipments WHERE customer_phone LIKE $1', [`%${cleanPhone}%`]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No parcels found for this phone number' });
      }
      // For each shipment, get status history
      const shipmentsWithHistory = await Promise.all(result.rows.map(async (shipment) => {
        const history = await db.query('SELECT * FROM status_history WHERE shipment_id = $1 ORDER BY created_at ASC', [shipment.id]);
        return { ...shipment, history: history.rows };
      }));
      res.json(shipmentsWithHistory);
    } catch (error) {
      res.status(500).json({ error: 'Database error' });
    }
  });

  return router;
}

module.exports = shipmentRoutes;
