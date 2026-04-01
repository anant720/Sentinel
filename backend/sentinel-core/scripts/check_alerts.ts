import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
async function check() {
    const res = await pool.query("SELECT id, type, severity, entity, created_at, organization_id FROM alerts WHERE organization_id = 'f5d90869-861d-4d66-8cd1-ac732cd0f48a' ORDER BY created_at DESC LIMIT 20;");
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
}
check();
