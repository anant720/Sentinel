import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5433/sentinel_core' });
async function check() {
    const res = await pool.query("SELECT id, name FROM organizations;");
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
}
check();
