import { FastifyRequest, FastifyReply } from 'fastify';
import { OrgService } from '../services/org.service.js';
import { DeviceService } from '../services/device.service.js';
import { AuditService } from '../services/audit.service.js';
import { z } from 'zod';

const registerDeviceSchema = z.object({
    name: z.string().min(2),
    type: z.string(),
    public_key: z.string().min(64),
    enrollment_token: z.string(),
    organization_api_key: z.string(),
});

const heartbeatSchema = z.object({
    device_id: z.string().uuid(),
    cpu_usage: z.number().min(0).max(100),
    memory_usage: z.number().min(0).max(100),
});

export class DeviceController {
    /**
     * Public route: device self-registration via org API key.
     * orgId is derived from the verified API key, NOT from a JWT.
     */
    static async register(request: FastifyRequest, reply: FastifyReply) {
        const validation = registerDeviceSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { organization_api_key, enrollment_token, name, type, public_key } = validation.data;

        // Derive orgId from API key — never from client body
        const org = await OrgService.verifyApiKey(organization_api_key);
        if (!org) {
            return reply.code(401).send({ error: 'Unauthorized', message: 'Invalid organization API key' });
        }

        const result = await DeviceService.registerDevice(org.id, enrollment_token, name, type, public_key);

        await AuditService.log({
            organization_id: org.id,
            action: 'device.register',
            resource_type: 'device',
            resource_id: result.device.id,
            ip_address: request.ip,
        });

        return reply.code(201).send(result);
    }

    /**
     * Protected: generate enrollment token.
     * req.orgId is always from JWT via orgIsolationMiddleware.
     */
    static async generateToken(request: FastifyRequest, reply: FastifyReply) {
        const rawToken = await DeviceService.createEnrollmentToken(request.orgId);
        return { enrollment_token: rawToken };
    }

    /**
     * Machine API: Agent heartbeat updates
     */
    static async heartbeat(request: FastifyRequest, reply: FastifyReply) {
        const validation = heartbeatSchema.safeParse(request.body);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const { device_id, cpu_usage, memory_usage } = validation.data;
        const success = await DeviceService.heartbeat(request.orgId, device_id, cpu_usage, memory_usage);

        if (!success) {
            return reply.code(404).send({ error: 'Not Found', message: 'Device not found or inactive' });
        }

        return reply.code(200).send({ message: 'Heartbeat acknowledged' });
    }

    /**
     * Protected API: List all devices
     */
    static async list(request: FastifyRequest, reply: FastifyReply) {
        const query = request.query as { limit?: string; offset?: string };
        const limit = parseInt(query.limit || '100', 10);
        const offset = parseInt(query.offset || '0', 10);

        const devices = await DeviceService.listDevices(request.orgId, limit, offset);
        return reply.code(200).send({ data: devices });
    }
}
