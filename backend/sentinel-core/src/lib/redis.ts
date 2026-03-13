import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export const redisClient = new Redis({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD || undefined,
    lazyConnect: true, // Only connects when requested, matching old behavior
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Connected to Redis'));

export const connectRedis = async (): Promise<void> => {
    if (redisClient.status === 'wait' || redisClient.status === 'close') {
        await redisClient.connect();
    }
};
