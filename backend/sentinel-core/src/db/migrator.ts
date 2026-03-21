import fs from 'fs';
import path from 'path';
import { db } from './client.js';
import { logger } from '../lib/logger.js';

export class Migrator {
    private migrationsDir: string;

    constructor() {
        // Resolve migrations relative to CURRENT file location (src/db/migrator.ts -> src/db/migrations)
        const __dirname = path.dirname(new URL(import.meta.url).pathname);
        const normalizedDir = process.platform === 'win32' ? __dirname.substring(1) : __dirname;
        
        // Handle both src (dev) and dist (prod) layouts
        this.migrationsDir = path.resolve(normalizedDir, 'migrations');
        
        if (!fs.existsSync(this.migrationsDir)) {
            // Fallback for production if they are at dist/db/migrations
            this.migrationsDir = path.join(process.cwd(), 'dist', 'db', 'migrations');
        }
        
        if (!fs.existsSync(this.migrationsDir)) {
             // Second fallback for dev if they are at src/db/migrations
             this.migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
        }
    }

    async migrate() {
        logger.info('🔍 Checking database migrations...');
        
        try {
            // 1. Ensure migrations table exists
            await db.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // 2. Read migration files
            if (!fs.existsSync(this.migrationsDir)) {
                logger.warn(`Migrations directory not found at ${this.migrationsDir}. Skipping.`);
                return;
            }

            const files = fs.readdirSync(this.migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort();

            // 3. Get applied migrations
            const { rows: applied } = await db.query('SELECT version FROM schema_migrations');
            const appliedVersions = new Set(applied.map(r => r.version));

            // 4. Apply missing migrations
            for (const file of files) {
                if (!appliedVersions.has(file)) {
                    logger.info(`🚀 Applying migration: ${file}`);
                    const sql = fs.readFileSync(path.join(this.migrationsDir, file), 'utf8');
                    
                    await db.query('BEGIN');
                    try {
                        await db.query(sql);
                        await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                        await db.query('COMMIT');
                        logger.info(`✅ Migration ${file} successful`);
                    } catch (err) {
                        await db.query('ROLLBACK');
                        logger.error(`❌ Migration ${file} failed:`, err);
                        throw err;
                    }
                }
            }
            
            logger.info('✨ Database is up to date');
        } catch (err) {
            logger.error('Critical failure during migration runner:', err);
            // We don't exit process here because we want the app to try to start anyway 
            // but the error will be visible in logs.
        }
    }
}

export const migrator = new Migrator();
