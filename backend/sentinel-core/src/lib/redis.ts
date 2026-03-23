import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

// Support full connection string if available (standard for Render/Upstash)
const redisUrl = process.env.REDIS_URL;

export const redisClient = redisUrl
    ? new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false, // DO NOT queue commands if Redis is down
        commandTimeout: 2000,      // Fail fast if Redis is slow
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    })
    : new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        enableOfflineQueue: false,
        commandTimeout: 2000,
    });

// Global health state — used by security middleware for Fail-Closed logic
export let isRedisHealthy = false;

// Attach error listener immediately to prevent unhandled rejections
redisClient.on('error', (err) => {
    // Only log once to avoid flooding logs during outages
    if (isRedisHealthy) {
        logger.error({ err: err.message }, 'Redis Connection Lost');
    }
    isRedisHealthy = false;
});

// Suppress unhandled rejections for background reconnects
redisClient.on('reconnecting', () => {
    isRedisHealthy = false;
});

redisClient.on('connect', () => {
    logger.info('Connected to Redis');
    isRedisHealthy = true;
});

redisClient.on('ready', () => {
    isRedisHealthy = true;
});

redisClient.on('close', () => {
    isRedisHealthy = false;
});

export const connectRedis = async (): Promise<void> => {
    try {
        if (redisClient.status === 'wait' || redisClient.status === 'close') {
            await redisClient.connect();
        }

        // Production Setup: Force Upstash serverless instances to use noeviction for BullMQ
        if (config.isProd) {
            try {
                logger.info('Attempting to configure Redis maxmemory-policy to noeviction for BullMQ...');
                await redisClient.config('SET', 'maxmemory-policy', 'noeviction');
                logger.info('Redis maxmemory-policy configured to noeviction successfully.');
            } catch (err: any) {
                logger.warn({ err: err.message }, 'Failed to configure Redis maxmemory-policy. If jobs stall, ensure this is set manually in your provider dashboard.');
            }
        }
    } catch (err: any) {
        logger.error({ err: err.message }, 'Redis initial connection failed');
        isRedisHealthy = false;
        // DO NOT throw; let the app start in degraded mode
    }
};
