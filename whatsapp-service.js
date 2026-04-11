// whatsapp-service.js
// Sends messages via WAHA (assumed running on WAHA_URL)

const axios = require('axios');

let wahaUrl = process.env.WAHA_URL || 'http://localhost:8080';

async function sendWhatsAppMessage(phoneNumber, message) {
  if (!phoneNumber) {
    console.error('No phone number provided');
    return false;
  }

  // Clean phone number: remove spaces, dashes, plus signs, ensure it starts with country code
  let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
  if (!cleanNumber.startsWith('91') && !cleanNumber.startsWith('1') && !cleanNumber.startsWith('44')) {
    // Assume India if no country code? Better to require full number with country code.
    // For simplicity, we'll prepend 91 (India) if missing and length is 10.
    if (cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }
  }

  // WAHA endpoint: POST /api/sendText
  const url = `${wahaUrl}/api/sendText`;
  const payload = {
    session: 'default',  // You need to create a session named 'default' in WAHA
    chatId: `${cleanNumber}@c.us`,
    text: message
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log(`WhatsApp sent to ${cleanNumber}: ${message.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.error(`WhatsApp failed to ${cleanNumber}:`, error.message);
    return false;
  }
}

module.exports = { sendWhatsAppMessage };
