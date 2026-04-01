import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || '' });
async function check() {
    const res = await pool.query("SELECT id, name FROM organizations;");
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
}
check();
