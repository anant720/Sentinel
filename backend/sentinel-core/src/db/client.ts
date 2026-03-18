import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

export const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_MAX_CONNECTIONS,
    allowExitOnIdle: true,
    idleTimeoutMillis: config.DB_IDLE_TIMEOUT,
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000, // Forces long-stalled transactions structurally executing poorly to immediately abort safely (10-second bound).
});

pool.on('connect', () => {
    logger.info('Connected to PostgreSQL');
});

pool.on('error', (err: any) => {
    logger.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

export const db = {
    query: (text: string, params?: any[]) => pool.query(text, params),
    getClient: () => pool.connect(),
};
