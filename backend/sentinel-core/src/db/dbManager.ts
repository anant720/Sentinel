import { logger } from '../lib/logger.js';

export class DatabaseManager {
    private static instance: DatabaseManager;
    private isHealthy: boolean = true;
    private retryCount: number = 0;
    private maxDelay: number = 30000; // 30 seconds max backoff

    private constructor() {}

    public static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    public setHealthy(status: boolean): void {
        const wasHealthy = this.isHealthy;
        this.isHealthy = status;
        
        if (wasHealthy !== status) {
            if (status) {
                logger.info('✅ Database connectivity restored');
                this.retryCount = 0;
            } else {
                logger.error('🚨 Database connectivity lost');
            }
        }
    }

    public getHealth(): boolean {
        return this.isHealthy;
    }

    public async handleConnectionError(retryFn: () => Promise<any>): Promise<void> {
        this.setHealthy(false);
        this.retryCount++;
        
        const delay = Math.min(Math.pow(2, this.retryCount) * 1000, this.maxDelay);
        logger.warn(`Database retry attempt ${this.retryCount} in ${delay}ms...`);
        
        setTimeout(async () => {
            try {
                await retryFn();
                this.setHealthy(true);
            } catch (err) {
                logger.error('Database reconnection attempt failed', err);
                // Continue retrying in background
                this.handleConnectionError(retryFn);
            }
        }, delay);
    }
}

export const dbManager = DatabaseManager.getInstance();
