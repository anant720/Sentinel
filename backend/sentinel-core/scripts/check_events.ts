import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5433/sentinel_core' });
async function check() {
    const res = await pool.query("SELECT id, organization_id, event_type, processed, created_at FROM events ORDER BY created_at DESC LIMIT 5;");
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
}
check();
