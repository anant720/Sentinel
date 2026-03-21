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
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000, 
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
