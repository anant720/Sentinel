import { Redis } from 'ioredis';

export interface DetectionEvent {
    id: string;
    type: string;
    timestamp: number;
    ip?: string;
    email?: string;
    device?: string;
    userAgent?: string;
    payload?: Record<string, any>;
}

export interface DetectionContext {
    redis: Redis;
    orgId: string;
}

export interface DetectionAlert {
    ruleId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    entity: string;
    evidence: any;
}

export interface DetectionRule {
    id: string;
    description: string;
    evaluate(event: DetectionEvent, context: DetectionContext): Promise<DetectionAlert | null>;
}
