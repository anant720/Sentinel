import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

// Support full connection string if available (standard for Render/Upstash)
const redisUrl = process.env.REDIS_URL;

export const redisClient = redisUrl
    ? new Redis(redisUrl, {
        lazyConnect: true,
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    })
    : new Redis({
        host: config.REDIS_HOST,
        port: config.REDIS_PORT,
        password: config.REDIS_PASSWORD || undefined,
        lazyConnect: true,
    });

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Connected to Redis'));

export const connectRedis = async (): Promise<void> => {
    if (redisClient.status === 'wait' || redisClient.status === 'close') {
        await redisClient.connect();
    }
};
