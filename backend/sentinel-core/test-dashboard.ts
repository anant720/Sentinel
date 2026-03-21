import pg from 'pg';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

async function testDashboardQueries() {
    const orgId = '1b7d66a3-9b8d-4e72-b4c2-3a83f7e36f6b'; // Sandbox Org ID

    try {
        console.log("1. Total Identities...");
        await pool.query('SELECT COUNT(*) as count FROM users WHERE organization_id = $1', [orgId]);
        

        console.log("2. Alerts Result...");
        await pool.query('SELECT COUNT(*) as count FROM alerts WHERE organization_id = $1 AND severity = \'critical\' AND status != \'RESOLVED\'', [orgId]);

        console.log("3. Detection Velocity...");
        await pool.query('SELECT COUNT(*) as count FROM audit_logs WHERE organization_id = $1 AND created_at > NOW() - INTERVAL \'1 hour\'', [orgId]);

        console.log("4. Geographic Nodes...");
        await pool.query('SELECT COUNT(DISTINCT (payload->>\'ip_address\')) as count FROM events WHERE organization_id = $1 AND created_at > NOW() - INTERVAL \'24 hours\'', [orgId]);

        console.log("5. Active Rules...");
        await pool.query('SELECT COUNT(*) as count FROM organization_detection_settings WHERE organization_id = $1 AND is_enabled = true', [orgId]);

        console.log("ALL QUERIES SUCCESSFUL.");
    } catch (err) {
        console.error("QUERY FAILED:", err);
    } finally {
        await pool.end();
    }
}

testDashboardQueries();
