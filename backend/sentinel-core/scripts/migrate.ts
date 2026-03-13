/**
 * scripts/migrate.ts
 * Run with: npx tsx scripts/migrate.ts
 */
import { Pool } from 'pg';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
    const client = await pool.connect();
    try {
        // 1. Ensure migrations history table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations_history (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        // 2. Dynamically load and sort migration files
        const migrationsDir = join(__dirname, '../src/db/migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        console.log(`📂 Found ${files.length} migration files in ${migrationsDir}`);

        // 3. Apply missing migrations
        for (const file of files) {
            // Check if already applied
            const { rowCount } = await client.query(
                'SELECT 1 FROM migrations_history WHERE filename = $1',
                [file]
            );

            if (rowCount && rowCount > 0) {
                console.log(`⏩ Skipping ${file} (already applied)`);
                continue;
            }

            console.log(`▶ Running ${file}...`);
            const sql = fs.readFileSync(join(migrationsDir, file), 'utf-8');

            // Execute inside a transaction to ensure atomic execution per file
            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query(
                    'INSERT INTO migrations_history (filename) VALUES ($1)',
                    [file]
                );
                await client.query('COMMIT');
                console.log(`✅ Finished ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            }
        }
        console.log('\n✅ All migrations complete.');
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

run();
