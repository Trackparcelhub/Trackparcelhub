// db.js - optional helper, but server.js already creates the pool
// You can keep this file for future use.

const { Pool } = require('pg');

let pool = null;

function getDb() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

module.exports = { getDb };
