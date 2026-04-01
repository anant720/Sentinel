import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    ROLE: z.enum(['api', 'worker', 'all']).default('all'),
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    JWT_SECRET: z.string().min(32),
    JWT_SECRETS: z.string().optional(), // Dynamic Multi-key string, e.g. "v1:xxxx,v2:yyyy"
    JWT_ACTIVE_KID: z.string().default('default'), // Specifies which key internally signs the NEW tokens
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    DATABASE_URL: z.string().url(),
    DB_MAX_CONNECTIONS: z.coerce.number().default(50),
    DB_IDLE_TIMEOUT: z.coerce.number().default(30000),

    REDIS_URL: z.string().optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional().nullable(),

    BCRYPT_SALT_ROUNDS: z.coerce.number().default(12),
    MAX_FAILED_ATTEMPTS: z.coerce.number().default(5),
    RATE_LIMIT_GLOBAL: z.coerce.number().default(100),
    RATE_LIMIT_LOGIN: z.coerce.number().default(100),
    RISK_BLOCK_THRESHOLD: z.coerce.number().default(90),
    RISK_VERIFY_THRESHOLD: z.coerce.number().default(60),
    ALLOWED_ORIGINS: z.string().optional().default('*'),
    FRONTEND_URL: z.string().url().optional(),
});

const envVars = envSchema.safeParse(process.env);

if (!envVars.success) {
    console.error('❌ Invalid environment variables:', envVars.error.format());
    process.exit(1);
}

// ── Production Strict Mode ────────────────────────────────────────────────────
// In production, we NEVER allow fallback defaults for secrets.
// The server fails fast with a clear message rather than running insecurely.
if (envVars.data.NODE_ENV === 'production') {
    const criticalChecks: Array<[string, string | undefined, number?]> = [
        ['JWT_SECRET', process.env.JWT_SECRET, 32],
        ['JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 32],
        ['DATABASE_URL', process.env.DATABASE_URL],
        ['REDIS_URL', process.env.REDIS_URL || process.env.REDIS_HOST],
        ['SMTP_HOST', process.env.SMTP_HOST],
        ['SMTP_USER', process.env.SMTP_USER],
        ['SMTP_PASS', process.env.SMTP_PASS],
        ['FRONTEND_URL', process.env.FRONTEND_URL],
    ];

    const failures: string[] = [];
    for (const [name, value, minLen] of criticalChecks) {
        if (!value) {
            failures.push(`  ✗ ${name} is missing`);
        } else if (minLen && value.length < minLen) {
            failures.push(`  ✗ ${name} must be at least ${minLen} characters (got ${value.length})`);
        }
    }

    if (failures.length > 0) {
        console.error('\n🚨 PRODUCTION ENV VALIDATION FAILED — server cannot start:');
        failures.forEach(f => console.error(f));
        console.error('\nSet all required secrets before deploying.\n');
        process.exit(1);
    }

    console.log('✅ Production environment validated.');
}

const parseJwtSecrets = (env: z.infer<typeof envSchema>) => {
    const map: Record<string, string> = {};
    if (env.JWT_SECRETS) {
        env.JWT_SECRETS.split(',').forEach(pair => {
            const [kid, secret] = pair.split(':');
            if (kid && secret) map[kid] = secret;
        });
    }
    // Fallback natively to the legacy single secret if default mapping isn't formally passed
    if (!map['default']) {
        map['default'] = env.JWT_SECRET;
    }
    return map;
};

export const config = {
    ...envVars.data,
    JWT_SECRETS_MAP: parseJwtSecrets(envVars.data),
    isDev: envVars.data.NODE_ENV === 'development',
    isProd: envVars.data.NODE_ENV === 'production',
};

export type Config = typeof config;
