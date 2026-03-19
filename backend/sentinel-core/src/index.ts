import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { generateRequestId, getJwtConfig } from './security/index.js';
import { config } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectRedis, redisClient } from './lib/redis.js';
import { setupQueue } from './queues/event.queue.js';
import { authMiddleware } from './middleware/auth.middleware.js';
import { orgIsolationMiddleware } from './middleware/org-isolation.middleware.js';
import { permissionMiddleware, Permission } from './middleware/permission.middleware.js';
import { AuthController } from './controllers/auth.controller.js';
import { OrgController } from './controllers/org.controller.js';
import { DeviceController } from './controllers/device.controller.js';
import { IngestionController } from './controllers/ingestion.controller.js';
import { AlertController } from './controllers/alert.controller.js';
import { NotificationController } from './controllers/notification.controller.js';
import { ApiKeyController } from './controllers/apikey.controller.js';
import { AuditController } from './controllers/audit.controller.js';
import { UserController } from './controllers/user.controller.js';
import { DashboardController } from './controllers/dashboard.controller.js';
import { detectionEngine } from './core/detection.engine.js';
import { MetricsService } from './services/metrics.service.js';
import { pool } from './db/client.js';
import { BroadcastService, SECURITY_EVENT_CHANNEL } from './services/broadcast.service.js';
import { Redis } from 'ioredis';
import { createVerifier } from 'fast-jwt';

// ---------------------------------------------------------------------------
// Server instance
// ---------------------------------------------------------------------------
const fastify: FastifyInstance = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
    bodyLimit: 10240, // Phase 6: Limit payload size strictly to 10kb
    genReqId: () => generateRequestId(),
});


export async function setupServer(fastify: FastifyInstance) {
    try {
        // ------------------------------------------------------------------
        // 1. Security plugins
        // ------------------------------------------------------------------
        await fastify.register(helmet, {
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'none'"],
                    scriptSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:"],
                    connectSrc: config.isDev
                        ? ["'self'", 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:5173']
                        : ["'self'", 'https://sentinel-admin-demo.vercel.app', 'https://sentinel-admin-git-2631-anant-suthars-projects.vercel.app', 'https://sentinel-admin-f0gq8332k-anant-suthars-projects.vercel.app'],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'none'"],
                    frameSrc: ["'none'"],
                    baseUri: ["'none'"],
                    formAction: ["'none'"],
                }
            },
            hsts: {
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            },
            frameguard: { action: 'deny' },
            dnsPrefetchControl: { allow: false },
            hidePoweredBy: true,
            noSniff: true,
            xssFilter: true,
        });

        // ------------------------------------------------------------------
        // Cache Poisoning Mitigation (OWASP)
        // ------------------------------------------------------------------
        fastify.addHook('onSend', async (request, reply, payload) => {
            reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            reply.header('Pragma', 'no-cache');
            reply.header('Expires', '0');
            reply.header('Surrogate-Control', 'no-store');
            return payload;
        });

        // CORS: dynamic based on FRONTEND_URL, ALLOWED_ORIGINS, and Vercel subdomains
        const devOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003', 'http://localhost:5173', 'http://localhost:8080'];
        const frontendUrl = process.env.FRONTEND_URL;
        const configOrigins = config.ALLOWED_ORIGINS === '*' ? [] : config.ALLOWED_ORIGINS.split(',');
        
        const originValidator = (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
            if (!origin || config.isDev) return cb(null, true);
            
            const isAllowed = 
                configOrigins.includes(origin) || 
                origin === frontendUrl || 
                origin.endsWith('.vercel.app') ||
                devOrigins.includes(origin);

            if (isAllowed) return cb(null, true);
            cb(null, false);
        };

        await fastify.register(cors, {
            origin: originValidator,
            credentials: true,
            methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        });
        await fastify.register(cookie);
        await fastify.register(jwt, getJwtConfig());

        // ------------------------------------------------------------------
        // 2. Rate limiting (Redis-backed for cross-node global enforcement)
        // ------------------------------------------------------------------
        await fastify.register(rateLimit, {
            redis: redisClient,
            max: config.RATE_LIMIT_GLOBAL,
            timeWindow: '1 minute',
            errorResponseBuilder: () => ({
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'Rate limit exceeded.',
            }),
        });

        // ------------------------------------------------------------------
        // Telemetry global hooks (Prometheus RED metrics)
        // ------------------------------------------------------------------
        fastify.addHook('onRequest', (request, reply, done) => {
            (request as any).startTime = process.hrtime();
            done();
        });

        fastify.addHook('onResponse', (request, reply, done) => {
            const hrtime = process.hrtime((request as any).startTime);
            const durationInSeconds = hrtime[0] + hrtime[1] / 1e9;

            MetricsService.httpRequestDuration.labels(
                request.method,
                request.routeOptions.url || request.url,
                reply.statusCode.toString()
            ).observe(durationInSeconds);

            // Extract Fastify rate limiter bumps (429 Too Many Requests)
            if (reply.statusCode === 429) {
                MetricsService.rateLimitTriggers.labels(
                    request.routeOptions.url || request.url,
                    request.ip
                ).inc();
            }

            done();
        });

        // Expose metrics directly to Prometheus scrapers
        fastify.get('/metrics', async (request, reply) => {
            reply.header('Content-Type', MetricsService.getContentType());
            return await MetricsService.getMetrics();
        });

        // ------------------------------------------------------------------
        // 3. Centralized error handler
        // ------------------------------------------------------------------
        fastify.setErrorHandler((error: FastifyError, request, reply) => {
            const statusCode = error.statusCode ?? 500;
            const isServerError = statusCode >= 500;

            logger.error(
                { err: error, reqId: request.id, url: request.url, statusCode },
                'Request error',
            );

            reply.code(statusCode).send({
                error: isServerError ? 'Internal Server Error' : error.message,
                statusCode,
                reqId: request.id,
                // Stack traces ONLY in development — never in production
                ...(config.isDev && isServerError ? { stack: error.stack } : {}),
            });
        });

        // ------------------------------------------------------------------
        // 4. Routes
        // ------------------------------------------------------------------
        
        // Root redirection/health status
        fastify.get('/', async () => {
            return {
                name: 'Sentinel Security Core API',
                version: '1.0.0',
                status: 'running',
                documentation: '/health/ready'
            };
        });

        // — Public: login (with tight rate limit, Redis-backed)
        fastify.register(async (pub: FastifyInstance) => {
            await pub.register(rateLimit, {
                redis: redisClient,
                max: config.RATE_LIMIT_LOGIN,
                timeWindow: '15m',
                keyGenerator: (req) => `login:${req.ip}`,
                errorResponseBuilder: () => ({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: 'Too many login attempts. Try again later.',
                }),
            });
            pub.post('/auth/login', AuthController.login);
        });

        // — Public: refresh token + device self-registration + public invites
        fastify.post('/auth/refresh', AuthController.refresh);
        fastify.post('/devices/register', DeviceController.register);
        fastify.post('/organizations/accept-invite', OrgController.acceptInvite);

        // — Machine API: Machine-to-Machine via sk_sentinel_ raw headers
        fastify.register(async (machine: FastifyInstance) => {
            const { apiKeyMiddleware } = await import('./middleware/apikey.middleware.js');
            // Extracts Bearing sk_sentinel_, cryptographically verifies Hash, sets req.orgId natively
            machine.addHook('preHandler', apiKeyMiddleware);

            machine.post('/events/ingest', IngestionController.ingest);
            machine.post('/devices/heartbeat', DeviceController.heartbeat);

            // Lightweight event logging for trusted web apps (no device/signature required)
            machine.post('/events/log', async (request: any, reply: any) => {
                const { EventService } = await import('./services/event.service.js');
                const body = request.body as any;
                if (!body?.event_type) {
                    return reply.code(400).send({ error: 'event_type is required' });
                }
                
                await EventService.publish({
                    organization_id: request.orgId,
                    event_type: body.event_type,
                    payload: body.payload ?? {}
                });

                return reply.code(202).send({ message: 'Event logged and enqueued for detection' });
            });
        });

        // — Protected: Auth → Org Isolation → (optional RBAC)
        fastify.register(async (protected_: FastifyInstance) => {
            // Step 1: Verify JWT
            protected_.addHook('preHandler', authMiddleware);
            // Step 2: Extract orgId from JWT → req.orgId (NEVER from client input)
            protected_.addHook('preHandler', orgIsolationMiddleware);

            // Auth — no extra RBAC needed
            protected_.post('/auth/logout', AuthController.logout);
            protected_.get('/auth/me', UserController.getMe);

            // Organizations — requires ORG_CREATE, ORG_READ, DEVICE_ENROLL_TOKEN, USER_MANAGE permissions
            protected_.register(async (admin: FastifyInstance) => {
                admin.post('/organizations',
                    { preHandler: permissionMiddleware(Permission.ORG_CREATE) },
                    OrgController.create);
                admin.get('/organizations/:id',
                    { preHandler: permissionMiddleware(Permission.ORG_READ) },
                    OrgController.getById);
                admin.post('/organizations/invite',
                    { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                    OrgController.invite);
                admin.post('/devices/enrollment-token',
                    { preHandler: permissionMiddleware(Permission.DEVICE_ENROLL_TOKEN) },
                    DeviceController.generateToken);
            });


            // Alerts — requires ALERT_READ / UPDATE permissions (Analyst+)
            protected_.register(async (alerts: FastifyInstance) => {
                alerts.get('/alerts',
                    { preHandler: permissionMiddleware(Permission.ALERT_READ) },
                    AlertController.getAlerts);
                alerts.patch('/alerts/:id/acknowledge',
                    { preHandler: permissionMiddleware(Permission.ALERT_UPDATE) },
                    AlertController.acknowledge);
                alerts.patch('/alerts/:id/resolve',
                    { preHandler: permissionMiddleware(Permission.ALERT_UPDATE) },
                    AlertController.resolve);
                alerts.patch('/alerts/:id/dismiss',
                    { preHandler: permissionMiddleware(Permission.ALERT_UPDATE) },
                    AlertController.dismiss);
                alerts.patch('/alerts/:id/status',
                    { preHandler: permissionMiddleware(Permission.ALERT_UPDATE) },
                    AlertController.updateStatus);
            });

            // Notifications — requires ALERT_READ (Analyst+)
            protected_.register(async (notifs: FastifyInstance) => {
                notifs.get('/notifications',
                    { preHandler: permissionMiddleware(Permission.ALERT_READ) },
                    NotificationController.getNotifications);
                notifs.patch('/notifications/:id/read',
                    { preHandler: permissionMiddleware(Permission.ALERT_READ) },
                    NotificationController.markAsRead);
                notifs.delete('/notifications',
                    { preHandler: permissionMiddleware(Permission.ALERT_UPDATE) },
                    NotificationController.clearAll);
            });

            // API Keys — ORG_ADMIN only
            protected_.register(async (keys: FastifyInstance) => {
                keys.get('/organizations/api-keys',
                    { preHandler: permissionMiddleware(Permission.API_KEY_MANAGE) },
                    ApiKeyController.list);
                keys.post('/organizations/api-keys',
                    { preHandler: permissionMiddleware(Permission.API_KEY_MANAGE) },
                    ApiKeyController.create);
                keys.delete('/organizations/api-keys/:keyId',
                    { preHandler: permissionMiddleware(Permission.API_KEY_MANAGE) },
                    ApiKeyController.revoke);
            });

            // Users — list org members (ORG_ADMIN)
            protected_.get('/users',
                { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                async (request: any, reply: any) => {
                    const { db } = await import('./lib/database.js');
                    const result = await db.query(
                        `SELECT 
                            id, 
                            email, 
                            full_name, 
                            role, 
                            is_active, 
                            created_at, 
                            last_seen_at,
                            CASE 
                                WHEN last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
                                WHEN last_seen_at > NOW() - INTERVAL '15 minutes' THEN 'away'
                                ELSE 'offline'
                            END as presence
                         FROM users WHERE organization_id = $1 ORDER BY created_at DESC`,
                        [request.orgId]
                    );
                    return { data: result.rows };
                }
            );

            protected_.delete('/users/:id',
                { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                UserController.deleteUser
            );

            protected_.patch('/users/:id/role',
                { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                UserController.updateRole
            );

            // Invitations — list pending invites for this org
            protected_.get('/organizations/invitations',
                { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                async (request: any, reply: any) => {
                    const { db } = await import('./lib/database.js');
                    const result = await db.query(
                        `SELECT id, email, role, is_used, expires_at, created_at
                         FROM invite_tokens
                         WHERE organization_id = $1 AND is_used = false AND expires_at > NOW()
                         ORDER BY created_at DESC`,
                        [request.orgId]
                    );
                    return { data: result.rows };
                }
            );

            protected_.delete('/organizations/invitations/:id',
                { preHandler: permissionMiddleware(Permission.USER_MANAGE) },
                OrgController.deleteInvitation
            );

            protected_.delete('/organizations/:id',
                { preHandler: permissionMiddleware(Permission.ORG_DELETE) },
                OrgController.deleteOrganization
            );

            // Org settings — rules configuration
            protected_.get('/organizations/settings',
                { preHandler: permissionMiddleware(Permission.ORG_READ) },
                async (request: any) => {
                    const { db } = await import('./lib/database.js');
                    const r = await db.query(
                        `SELECT module_id, enabled, config FROM organization_detection_settings WHERE organization_id = $1`,
                        [request.orgId]
                    );
                    const settings: Record<string, any> = {};
                    r.rows.forEach((row: any) => {
                        settings[row.module_id] = { enabled: row.enabled, ...(row.config || {}) };
                    });
                    return { data: settings };
                }
            );

            protected_.get('/organizations/audit-logs',
                { preHandler: permissionMiddleware(Permission.ORG_READ) },
                AuditController.getLogs
            );

            protected_.get('/organizations/audit-logs/export',
                { preHandler: permissionMiddleware(Permission.ORG_READ) },
                AuditController.exportLogs
            );

            protected_.patch('/organizations/settings',
                { preHandler: permissionMiddleware(Permission.SETTINGS_MANAGE) },
                async (request: any) => {
                    const { db } = await import('./lib/database.js');
                    const body = request.body as Record<string, any>;
                    
                    for (const moduleId of Object.keys(body)) {
                        const { enabled, ...config } = body[moduleId];
                        await db.query(
                            `INSERT INTO organization_detection_settings (organization_id, module_id, enabled, config)
                             VALUES ($1, $2, $3, $4)
                             ON CONFLICT (organization_id, module_id)
                             DO UPDATE SET enabled = $3, config = $4, updated_at = NOW()`,
                            [request.orgId, moduleId, enabled ?? true, config]
                        );
                    }
                    return { message: 'Settings updated' };
                }
            );

            // Devices
            protected_.get('/devices',
                { preHandler: permissionMiddleware(Permission.ORG_READ) },
                DeviceController.list
            );

            // Events — org-scoped telemetry events for dashboard (Analyst+)
            protected_.get('/events',
                { preHandler: permissionMiddleware(Permission.EVENT_READ) },
                async (request: any, reply: any) => {
                    const { db } = await import('./lib/database.js');
                    const { page = 1, limit = 100, type } = request.query as any;
                    const offset = (page - 1) * limit;
                    const conditions: string[] = ['organization_id = $1'];
                    const params: any[] = [request.orgId];
                    if (type) {
                        params.push(type);
                        conditions.push(`event_type = $${params.length}`);
                    }
                    const where = conditions.join(' AND ');
                    const result = await db.query(
                        `SELECT
                             id,
                             event_type                              AS type,
                             device_id,
                             payload->>'ip_address'                  AS ip_address,
                             payload->>'user_agent'                  AS user_agent,
                             payload->>'source_app'                  AS source_app,
                             payload->>'destination'                 AS destination,
                             COALESCE(payload->>'email',
                                      payload->>'user_email')        AS email,
                             COALESCE(payload->>'employee_name',
                                      payload->>'user_name')         AS employee_name,
                             risk_score::numeric                     AS risk_score,
                             payload,
                             created_at,
                             organization_id
                         FROM events
                         WHERE ${where}
                         ORDER BY created_at DESC
                         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                        [...params, limit, offset]
                    );
                    const countRes = await db.query(
                        `SELECT COUNT(*) as total FROM events WHERE ${where}`,
                        params
                    );
                    return {
                        data: result.rows,
                        total: parseInt(countRes.rows[0].total, 10),
                        page: Number(page),
                        limit: Number(limit),
                    };
                }
            );

            protected_.register(async (dashboard: FastifyInstance) => {
                dashboard.get('/dashboard/stats',
                    { preHandler: permissionMiddleware(Permission.ORG_READ) },
                    DashboardController.getMetrics
                );
                dashboard.get('/dashboard/risk-trend',
                    { preHandler: permissionMiddleware(Permission.ORG_READ) },
                    DashboardController.getRisk
                );
                dashboard.post('/security/scan',
                    { preHandler: permissionMiddleware(Permission.ORG_READ) },
                    DashboardController.runScan
                );
                dashboard.get('/dashboard/risk/historical',
                    { preHandler: permissionMiddleware(Permission.ORG_READ) },
                    DashboardController.getHistoricalRisk
                );
            });

        });

        // — Health checks (public, kubernetes-compliant)

        // Liveness probe (Are we mathematically alive?)
        fastify.get('/health/live', async (request, reply) => {
            return reply.send({ status: 'live', uptime: process.uptime() });
        });

        // Readiness probe (Are our dependencies connected?)
        fastify.get('/health/ready', async (request, reply) => {
            let dbConnected = true;
            try {
                await pool.query('SELECT 1');
            } catch {
                dbConnected = false;
            }

            const redisConnected = redisClient.status === 'ready';
            const isReady = dbConnected && redisConnected;

            return reply.code(isReady ? 200 : 503).send({
                status: isReady ? 'ready' : 'unavailable',
                timestamp: new Date().toISOString(),
                services: {
                    database: dbConnected ? 'connected' : 'disconnected',
                    redis: redisConnected ? 'connected' : 'disconnected',
                },
            });
        });

    } catch (err) {
        logger.error({ err }, 'Failed to setup Fastify plugins');
        throw err;
    }
}

async function bootstrap() {
    try {
        await setupServer(fastify);

        // ------------------------------------------------------------------
        // 5. External services & plugins
        // ------------------------------------------------------------------
        await connectRedis();
        setupQueue();
        await detectionEngine.initialize(fastify);

        if (config.ROLE === 'all') {
            await import('./queues/event.worker.js');
            logger.info('Background Worker initialized synchronously in Monolith profile');
        }

        // — Health checks (public, kubernetes-compliant)
        fastify.get('/health', async () => {
            return { status: 'healthy', timestamp: new Date().toISOString() };
        });

        // ------------------------------------------------------------------
        // WebSocket server for real-time security event streaming
        // ------------------------------------------------------------------
        const { WebSocketServer } = await import('ws');
        const httpServer = (fastify.server as any);
        const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

        // Publish helper — attach to global so detection engine can call it
        (global as any).broadcastSecurityEvent = (event: object) => {
            BroadcastService.publish(event as any).catch((err: any) => 
                logger.error({ err: err.message }, 'Global broadcast failure')
            );
        };

        // ── Redis Subscriber for Hooking Event Ingestion (Cross-Process) ──
        const subscriber = process.env.REDIS_URL
            ? new Redis(process.env.REDIS_URL, {
                tls: process.env.REDIS_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
              })
            : new Redis({
                host: config.REDIS_HOST,
                port: config.REDIS_PORT,
                password: config.REDIS_PASSWORD || undefined,
              });

        subscriber.subscribe(SECURITY_EVENT_CHANNEL, (err) => {
            if (err) logger.error({ err: err.message }, 'Failed to subscribe to security events channel');
            else logger.info('Subscribed to Redis security_events channel for real-time broadcasting');
        });

        const { MANAGEMENT_EVENT_CHANNEL } = await import('./services/broadcast.service.js');
        subscriber.subscribe(MANAGEMENT_EVENT_CHANNEL, (err) => {
            if (err) logger.error({ err: err.message }, 'Failed to subscribe to management events channel');
            else logger.info('Subscribed to Redis management_events channel for real-time broadcasting');
        });

        subscriber.on('message', (channel, message) => {
            if (channel === SECURITY_EVENT_CHANNEL || channel === MANAGEMENT_EVENT_CHANNEL) {
                wss.clients.forEach((client: any) => {
                    if (client.readyState === 1) client.send(message);
                });
            }
        });

        wss.on('connection', async (socket: any, req: any) => {
            // Authenticate via ?token= query param
            const url = new URL(req.url!, `http://localhost`);
            const token = url.searchParams.get('token');
            if (!token) { socket.close(4001, 'Unauthorized'); return; }
            try {
                const decoded: any = fastify.jwt.decode(token, { complete: true });
                const kid = decoded?.header?.kid || 'default';
                const secret = config.JWT_SECRETS_MAP[kid];

                if (!secret) {
                    logger.warn({ kid }, 'WS Auth failed: Invalid key ID');
                    socket.close(4001, 'Invalid token');
                    return;
                }

                const verifier = createVerifier({ key: secret });
                verifier(token);
            } catch (err: any) {
                logger.error({ err: err.message }, 'WS Auth exception');
                socket.close(4001, 'Invalid token'); 
                return;
            }
            socket.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
            logger.info('WebSocket client authenticated and connected');
        });

        // ------------------------------------------------------------------
        // 6. Start
        // ------------------------------------------------------------------
        await fastify.listen({ port: config.PORT, host: config.HOST });
        logger.info(`🚀 Sentinel Core started on http://${config.HOST}:${config.PORT}`);
        logger.info('WebSocket server ready at /ws');

        // ------------------------------------------------------------------
        // 7. Nightly DB maintenance (Retention + partition creation)
        // ------------------------------------------------------------------
        const { RetentionService } = await import('./services/retention.service.js');
        RetentionService.createNextMonthPartition().catch(err =>
            logger.error({ err }, 'Failed to pre-create next month partition')
        );
        setInterval(() => {
            RetentionService.runNightlyMaintenance().catch(err =>
                logger.error({ err }, 'Nightly DB maintenance failed')
            );
        }, 24 * 60 * 60 * 1000);

        // ------------------------------------------------------------------
        // 8. Risk Snapshotting (Every 15 minutes)
        // ------------------------------------------------------------------
        setInterval(async () => {
            try {
                const { db } = await import('./lib/database.js');
                const { DashboardService } = await import('./services/dashboard.service.js');
                const orgs = await db.query('SELECT id FROM organizations WHERE is_active = true');
                for (const org of orgs.rows) {
                    await DashboardService.snapshotRiskScore(org.id);
                }
                logger.info(`Captured risk snapshots for ${orgs.rowCount} organizations`);
            } catch (err) {
                logger.error({ err }, 'Risk snapshotting failed');
            }
        }, 60 * 1000);

        // ------------------------------------------------------------------
        // Graceful shutdown
        // ------------------------------------------------------------------
        const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
        signals.forEach((signal) => {
            process.on(signal, async () => {
                logger.info(`Received ${signal}, shutting down…`);
                try {
                    await fastify.close();
                    await redisClient.quit();
                    await pool.end();
                    logger.info('All connections closed. Goodbye!');
                } finally {
                    process.exit(0);
                }
            });
        });
    } catch (err) {
        logger.error({ err }, 'Failed to start server');
        process.exit(1);
    }
}

// Ensure tests can import this without starting the listeners
if (process.env.NODE_ENV !== 'test') {
    bootstrap();
}

export default fastify;
