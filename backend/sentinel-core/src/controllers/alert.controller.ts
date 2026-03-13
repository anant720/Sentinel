import { FastifyRequest, FastifyReply } from 'fastify';
import { AlertService } from '../services/alert.service.js';
import { JWTPayload } from '../middleware/auth.middleware.js';
import { z } from 'zod';

const transitionSchema = z.object({
    note: z.string().optional()
});

const querySchema = z.object({
    status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']).optional(),
    limit: z.coerce.number().min(1).max(500).default(50)
});

export class AlertController {
    static async getAlerts(request: FastifyRequest, reply: FastifyReply) {
        const validation = querySchema.safeParse(request.query);
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        const alerts = await AlertService.getAlerts(request.orgId, validation.data.limit);

        // Simple in-memory filter until the Service supports param injection natively
        let filteredAlerts = alerts;
        if (validation.data.status) {
            filteredAlerts = alerts.filter(a => a.status === validation.data.status);
        }

        return reply.code(200).send({ data: filteredAlerts });
    }

    static async acknowledge(request: FastifyRequest, reply: FastifyReply) {
        return AlertController.transition(request, reply, 'ACKNOWLEDGED');
    }

    static async resolve(request: FastifyRequest, reply: FastifyReply) {
        return AlertController.transition(request, reply, 'RESOLVED');
    }

    static async dismiss(request: FastifyRequest, reply: FastifyReply) {
        return AlertController.transition(request, reply, 'DISMISSED');
    }

    static async updateStatus(request: FastifyRequest, reply: FastifyReply) {
        const { status } = request.body as { status: string };
        const upperStatus = status.toUpperCase();
        return AlertController.transition(request, reply, upperStatus);
    }


    private static async transition(request: FastifyRequest, reply: FastifyReply, newStatus: string) {
        const { id } = request.params as { id: string };
        const { user_id } = request.user as JWTPayload;

        const validation = transitionSchema.safeParse(request.body || {});
        if (!validation.success) {
            return reply.code(400).send({ error: 'Bad Request', details: validation.error.format() });
        }

        try {
            const result = await AlertService.transitionStatus(
                request.orgId,
                id,
                newStatus,
                user_id,
                validation.data.note
            );
            return reply.code(200).send(result);

        } catch (error: any) {
            if (error.message.includes('not found')) {
                return reply.code(404).send({ error: 'Not Found', message: error.message });
            }
            if (error.message.includes('Invalid lifecycle transition')) {
                return reply.code(409).send({ error: 'Conflict', message: error.message });
            }
            throw error;
        }
    }
}
