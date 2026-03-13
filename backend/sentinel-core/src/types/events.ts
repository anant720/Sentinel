/**
 * src/types/events.ts
 * ─────────────────────
 * Canonical Event Contract — Single source of truth for all event types.
 *
 * PURPOSE:
 *   Defines the official set of event types, their required/optional fields,
 *   and the Zod validation schemas for each. Any event not matching this
 *   contract is rejected at the ingestion boundary with a 400 error.
 *
 * RULES:
 *   - event_type must be one of the CanonicalEventType enum members
 *   - Each event type has a typed payload schema
 *   - user_id and timestamp are always required
 *   - ip_address, device_id, severity, metadata are optional
 *   - Adding new event types = add enum member + payload schema + union branch
 */
import { z } from 'zod';

// ── Official Event Type Registry ─────────────────────────────────────────────

export const CanonicalEventType = {
    LOGIN_ATTEMPT: 'login_attempt',
    LOGIN_FAILURE: 'login_failure',
    PASSWORD_RESET: 'password_reset',
    ROLE_CHANGE: 'role_change',
    PERMISSION_ESCALATION: 'permission_escalation',
    ACCOUNT_LOCKOUT: 'account_lockout',
    SUSPICIOUS_IP_ACCESS: 'suspicious_ip_access',
    API_RATE_VIOLATION: 'api_rate_violation',
    DEVICE_REGISTRATION: 'device_registration',
    ADMIN_ACTION: 'admin_action',
    // Legacy: keep supporting existing login_failed event type for backwards compat
    LOGIN_FAILED: 'login_failed',
} as const;

export type CanonicalEventTypeValue = typeof CanonicalEventType[keyof typeof CanonicalEventType];

// ── Base fields present on every event ───────────────────────────────────────

const BaseEventPayload = z.object({
    user_id: z.string().min(1, 'user_id is required'),
    timestamp: z.number().int().positive('timestamp must be a positive Unix epoch ms'),
    ip_address: z.string().ip().optional(),
    device_id: z.string().uuid().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    metadata: z.record(z.unknown()).optional(),
});

// ── Per-event-type Payload Schemas ────────────────────────────────────────────

const LoginAttemptPayload = BaseEventPayload.extend({
    email: z.string().email(),
    success: z.boolean(),
    method: z.enum(['password', 'sso', 'api_key', 'token']).optional(),
});

const LoginFailurePayload = BaseEventPayload.extend({
    email: z.string().email(),
    reason: z.enum(['invalid_password', 'account_locked', 'user_not_found', 'expired_token']).optional(),
    attempt_count: z.number().int().min(1).optional(),
});

// backwards compat alias
const LoginFailedPayload = BaseEventPayload.extend({
    email: z.string().email(),
});

const PasswordResetPayload = BaseEventPayload.extend({
    email: z.string().email(),
    initiated_by: z.enum(['user', 'admin', 'system']),
});

const RoleChangePayload = BaseEventPayload.extend({
    target_user_id: z.string().min(1),
    old_role: z.string().min(1),
    new_role: z.string().min(1),
    changed_by: z.string().min(1),
});

const PermissionEscalationPayload = BaseEventPayload.extend({
    target_user_id: z.string().min(1),
    escalated_permission: z.string().min(1),
    authorized: z.boolean(),
});

const AccountLockoutPayload = BaseEventPayload.extend({
    email: z.string().email(),
    lockout_until: z.string().datetime().optional(),
    reason: z.enum(['brute_force', 'admin_action', 'policy_violation']).optional(),
});

const SuspiciousIpAccessPayload = BaseEventPayload.extend({
    ip_address: z.string().ip(),
    country_code: z.string().length(2).optional(),
    action: z.string().min(1),
    blocked: z.boolean().optional(),
});

const ApiRateViolationPayload = BaseEventPayload.extend({
    endpoint: z.string().min(1),
    requests_made: z.number().int().min(1),
    limit: z.number().int().min(1),
    window_ms: z.number().int().min(1).optional(),
});

const DeviceRegistrationPayload = BaseEventPayload.extend({
    device_name: z.string().min(1),
    device_type: z.string().optional(),
    public_key: z.string().min(1),
});

const AdminActionPayload = BaseEventPayload.extend({
    action: z.string().min(1),
    resource_type: z.string().min(1),
    resource_id: z.string().optional(),
    outcome: z.enum(['success', 'failure', 'partial']).optional(),
});

// ── Canonical Discriminated Union ─────────────────────────────────────────────

export const CanonicalEventSchema = z.discriminatedUnion('event_type', [
    z.object({ event_type: z.literal(CanonicalEventType.LOGIN_ATTEMPT), payload: LoginAttemptPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.LOGIN_FAILURE), payload: LoginFailurePayload }),
    z.object({ event_type: z.literal(CanonicalEventType.LOGIN_FAILED), payload: LoginFailedPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.PASSWORD_RESET), payload: PasswordResetPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.ROLE_CHANGE), payload: RoleChangePayload }),
    z.object({ event_type: z.literal(CanonicalEventType.PERMISSION_ESCALATION), payload: PermissionEscalationPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.ACCOUNT_LOCKOUT), payload: AccountLockoutPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.SUSPICIOUS_IP_ACCESS), payload: SuspiciousIpAccessPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.API_RATE_VIOLATION), payload: ApiRateViolationPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.DEVICE_REGISTRATION), payload: DeviceRegistrationPayload }),
    z.object({ event_type: z.literal(CanonicalEventType.ADMIN_ACTION), payload: AdminActionPayload }),
]);

export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

/**
 * Validates the event_type + payload combination against the canonical contract.
 * Returns { valid: true } or { valid: false, errors: ZodFormattedError }.
 */
export function validateCanonicalEvent(event_type: string, payload: unknown): { valid: true } | { valid: false; errors: unknown } {
    const parsed = CanonicalEventSchema.safeParse({ event_type, payload });
    if (parsed.success) return { valid: true };
    return { valid: false, errors: parsed.error.format() };
}
