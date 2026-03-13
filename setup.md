# Sentinel 26.3.0 Complete Setup Guide

This guide covers the entire process of setting up Sentinel on a local machine—from cloning the repository to integrating the dummy target application.

---

## 1. Prerequisites
Ensure you have the following installed on your machine:
- **Node.js**: v18 or newer
- **Docker & Docker Compose**: For spinning up postgres and redis.
- **Git**

---

## 2. Clone the Repository
Open your terminal and clone the repository:
```bash
git clone https://github.com/your-username/sentinel.git
cd sentinel
```

---

## 3. Start the Backend Infrastructure (Docker)

Sentinel relies on PostgreSQL as its primary datastore and Redis for Pub/Sub and rate-limiting. We will use the provided `docker-compose.yml`.

```bash
cd backend/sentinel-core

# 1. Start the database and cache in the background
docker-compose up -d db pgbouncer redis

# 2. Copy the environment configuration
cp .env.example .env
```
*Note: Ensure your `.env` file reflects the Docker PostgreSQL URL: `postgres://user:pass@localhost:5433/sentinel` (or whatever your specific docker-compose maps to).*

### Install Dependencies & Run Migrations
```bash
npm install

# Run the backend API in development mode
npm run dev
```
*(Wait a few seconds for Fastify to bind to port 3000 and initialize the database tables natively).*

---

## 4. Create an Organization & Admin (via Terminal)

Because Sentinel is fully isolated, you cannot log into the frontend without first provisioning an organization and an Admin user. 

Keep your backend running in terminal 1. Open a **new terminal window**, navigate to `backend/sentinel-core`, and run the following automated seed code. This code directly interfaces with your local PostgreSQL instance to inject a new Organization, seed an Admin user, and instantly issue a raw API Key.

```bash
node -e "
const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();
  const orgId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const apiKeyId = crypto.randomUUID();
  
  const rawKey = 'sk_sentinel_' + crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const prefix = rawKey.substring(0, 14);

  // 1. Create Organization
  await client.query(\`INSERT INTO organizations (id, name, slug, api_key_hash) VALUES (\$1, 'Acme Corp', 'acme-corp', \$2)\`, [orgId, keyHash]);
  
  // 2. Create Admin (Password is Sentinel@2026!)
  const passwordHash = '\$2b\$12\$FCRTFQ9zhV8zzzx.46wXne5VvvPKuK7EzxP.M0lLPg3FexsI28USy';
  await client.query(\`INSERT INTO users (id, organization_id, email, password_hash, full_name, role) VALUES (\$1, \$2, 'admin@sentinel.local', \$3, 'System Admin', 'org_admin')\`, [adminId, orgId, passwordHash]);
  
  // 3. Register the API Key
  await client.query(\`INSERT INTO api_keys (id, organization_id, key_hash, prefix, rate_limit_per_minute) VALUES (\$1, \$2, \$3, \$4, 1000)\`, [apiKeyId, orgId, keyHash, prefix]);
  
  console.log('\n✅ Setup Complete!');
  console.log('--------------------------------------------------');
  console.log('Dashboard Login:  admin@sentinel.local');
  console.log('Dashboard Pass:   Sentinel@2026!');
  console.log('SECRET API KEY:   ' + rawKey);
  console.log('--------------------------------------------------\n');
  await client.end();
}
seed().catch(console.error);
"
```
**SAVE the `SECRET API KEY` outputted by this script.** You will need it in Step 6.

---

## 5. Start the Admin Console (Frontend)

Now that you have admin credentials, start the React frontend.

Open a **third terminal window**:
```bash
cd frontend/sentinel-admin
npm install

# Start Vite development server
npm run dev
```
Navigate to `http://localhost:5173`.
Log in using:
- **Email:** `admin@sentinel.local`
- **Password:** `Sentinel@2026!`

---

## 6. Integrate the Acme Portal Demo

To see Sentinel actually block threats, we need to spin up the mock application.

Open a **fourth terminal window**:
```bash
cd demo/acme-portal
npm install
```

Open the `.env` file inside `demo/acme-portal/` (or create one) and configure it to point to Sentinel, pasting the Secret API Key you generated in Step 4:
```env
PORT=4000
SENTINEL_URL=http://localhost:3000
SENTINEL_API_KEY=sk_sentinel_REPLACE_WITH_YOUR_KEY
```

Start the dummy portal:
```bash
npm start
```

### Validate Ingestion
Navigate to `http://localhost:4000` (The Acme Portal). 
Attempt several failed logins using fake emails (e.g., `hacker@test.com`).
Return to your Sentinel Admin Console at `http://localhost:5173/live-events`. You will immediately see the failed login events streaming via WebSockets, and if you fail enough times, an Alert will trigger!
