// webhook-handler.js
// Receives updates from couriers and normalizes status

async function webhookHandler(req, res, db, sendWhatsApp) {
  try {
    const payload = req.body;
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    // STEP 1: Identify courier based on payload structure
    let courier = 'unknown';
    let trackingId = null;
    let rawStatus = null;

    if (payload.tracking_number && payload.status) {
      courier = 'TCS';
      trackingId = payload.tracking_number;
      rawStatus = payload.status;
    } else if (payload.awb && payload.event) {
      courier = 'Leopards';
      trackingId = payload.awb;
      rawStatus = payload.event;
    } else if (payload.shipment_id && payload.current_status) {
      courier = 'Stallion';
      trackingId = payload.shipment_id;
      rawStatus = payload.current_status;
    } else {
      // Unknown courier format – log but still try to find tracking_id
      trackingId = payload.tracking_id || payload.id || payload.reference;
      rawStatus = payload.status || payload.state;
    }

    if (!trackingId) {
      return res.status(400).json({ error: 'Missing tracking ID' });
    }

    // STEP 2: Normalize status to unified values
    let unifiedStatus = 'unknown';
    const statusLower = String(rawStatus).toLowerCase();

    if (statusLower.includes('book') || statusLower.includes('create') || statusLower === 'label_generated') {
      unifiedStatus = 'booked';
    } else if (statusLower.includes('pick') || statusLower.includes('collect')) {
      unifiedStatus = 'picked_up';
    } else if (statusLower.includes('transit') || statusLower.includes('dispatch') || statusLower === 'on_the_way') {
      unifiedStatus = 'on_the_way';
    } else if (statusLower.includes('out_for_delivery') || statusLower.includes('with_courier')) {
      unifiedStatus = 'out_for_delivery';
    } else if (statusLower.includes('deliver') || statusLower === 'completed') {
      unifiedStatus = 'delivered';
    } else if (statusLower.includes('fail') || statusLower.includes('attempt') || statusLower === 'rto') {
      unifiedStatus = 'failed';
    } else if (statusLower.includes('cancel')) {
      unifiedStatus = 'cancelled';
    }

    // STEP 3: Find shipment in database
    const shipmentQuery = await db.query(
      'SELECT id, merchant_id, customer_id, customer_phone, cod_amount, courier, current_status FROM shipments WHERE tracking_id = $1',
      [trackingId]
    );

    if (shipmentQuery.rows.length === 0) {
      console.log(`Shipment ${trackingId} not found in DB. Maybe not created yet.`);
      return res.status(200).json({ message: 'Webhook received but shipment unknown' });
    }

    const shipment = shipmentQuery.rows[0];
    const oldStatus = shipment.current_status;

    // STEP 4: Update shipment status and insert history
    if (oldStatus !== unifiedStatus) {
      await db.query(
        'UPDATE shipments SET current_status = $1, updated_at = NOW() WHERE id = $2',
        [unifiedStatus, shipment.id]
      );

      await db.query(
        `INSERT INTO status_history (shipment_id, old_status, new_status, raw_webhook, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [shipment.id, oldStatus, unifiedStatus, JSON.stringify(payload)]
      );

      // STEP 5: Send WhatsApp notification to customer (if not failed)
      if (unifiedStatus !== 'failed' && shipment.customer_phone) {
        const message = getWhatsAppMessage(unifiedStatus, shipment.tracking_id, shipment.cod_amount);
        await sendWhatsApp(shipment.customer_phone, message);
      }

      // STEP 6: If failed, create alert for merchant (we'll handle via API later)
      if (unifiedStatus === 'failed') {
        // You can also insert into failed_deliveries table here
        console.log(`FAILED DELIVERY: ${trackingId}. Merchant alert needed.`);
      }
    }

    res.status(200).json({ message: 'Webhook processed', trackingId, newStatus: unifiedStatus });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper to generate WhatsApp messages based on status
function getWhatsAppMessage(status, trackingId, codAmount) {
  const baseLink = `https://your-customer-portal.onrender.com/track/${trackingId}`;
  switch (status) {
    case 'booked':
      return `📦 *Parcel Booked*\nTracking ID: ${trackingId}\nTrack here: ${baseLink}`;
    case 'picked_up':
      return `✅ *Parcel Picked Up*\nYour parcel ${trackingId} is on its way!`;
    case 'on_the_way':
      return `🚚 *Parcel On The Way*\n${trackingId} is moving towards you.`;
    case 'out_for_delivery':
      return `🚨 *Out for Delivery*\nKeep ₹${codAmount || 'COD'} ready! Track live: ${baseLink}`;
    case 'delivered':
      return `🎉 *Delivered!*\nThank you for shopping. Rate us: ${baseLink}/feedback`;
    default:
      return `Your parcel ${trackingId} status: ${status}. Track: ${baseLink}`;
  }
}

module.exports = webhookHandler;
