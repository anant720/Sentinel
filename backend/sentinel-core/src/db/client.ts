import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';
import { dbManager } from './dbManager.js';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_MAX_CONNECTIONS,
    allowExitOnIdle: true,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT,
    connectionTimeoutMillis: 5000, // Increased for cloud cold-start resilience
    statement_timeout: 10000, 
    ssl: config.isProd ? { rejectUnauthorized: false } : false, // Required for most managed DBs (Render, AWS)
});

pool.on('connect', () => {
    logger.info('Connected to PostgreSQL');
    dbManager.setHealthy(true);
});

pool.on('error', (err: any) => {
    logger.error('Unexpected error on idle PostgreSQL client', err);
    dbManager.setHealthy(false);
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    getClient: () => pool.connect(),
};
