import { getJwtConfig } from '../src/security/index.js'; // to satisfy any load config
import '../src/queues/event.worker.js';
import { logger } from '../src/lib/logger.js';

logger.info('Standalone Worker Process Listening for BullMQ Jobs...');
