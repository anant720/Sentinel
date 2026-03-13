import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/sentinel_core';

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function applyMigration() {
    try {
        const migrationPath = path.join(__dirname, '../src/db/migrations/024_notifications_table.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log('Applying migration: 024_notifications_table.sql');
        await pool.query(sql);
        console.log('Migration applied successfully.');
    } catch (error) {
        console.error('Failed to apply migration:', error);
    } finally {
        await pool.end();
    }
}

applyMigration();
