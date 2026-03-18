const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function register() {
  try {
    await client.connect();
    const orgId = '1b7d66a3-9b8d-4e72-b4c2-3a83f7e36f6b';
    const rawKey = 'sk_sentinel_hackathon_demo_key_2026';
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 14);

    // Delete existing keys with the same prefix if any
    await client.query('DELETE FROM api_keys WHERE prefix = $1', [prefix]);

    // Insert new key
    await client.query(
      'INSERT INTO api_keys (id, organization_id, key_hash, prefix, rate_limit_per_minute) VALUES ($1, $2, $3, $4, 1000)',
      [crypto.randomUUID(), orgId, keyHash, prefix]
    );

    console.log('✅ Registered Hook Key: ' + rawKey);
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.end();
  }
}

register();
