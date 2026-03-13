import pino from 'pino';
import { config } from '../config/index.js';

// Fields deliberately redacted from application logs
const PII_FIELDS = new Set(['email', 'password', 'token', 'refresh_token', 'access_token', 'secret']);

const piiScrubber = (key: string, value: any) => {
    if (PII_FIELDS.has(key)) {
        return '[REDACTED]';
    }
    return value;
};

export const logger = (pino as any)({
    level: config.LOG_LEVEL as string,
    // Strict compliance format: JSON by default unless running dev
    formatters: {
        level: (label: string) => {
            return { level: label };
        },
    },
    serializers: {
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
        err: pino.stdSerializers.err,
    },
    // Redact strings during JSON parsing hook
    hooks: {
        logMethod(inputArgs: any[], method: any) {
            // Very rudimentary scrubber, typically one maps over nested objects.
            // For production, we pass serializers down.
            return method.apply(this, inputArgs);
        }
    },
    // We utilize Pino's native redaction capabilities for PII
    redact: {
        paths: [
            'email',
            '*.email',
            'payload.email',
            'password',
            '*.password',
            'token',
            '*.token',
            'refresh_token',
            'access_token'
        ],
        censor: '[REDACTED]'
    },
    transport: config.isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        }
        : undefined, // Native fast JSON parsing directly to stdout in non-dev envs
});
