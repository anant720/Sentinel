import { FastifyRequest, FastifyReply } from 'fastify';
import { NotificationService } from '../services/notification.service.js';

export class NotificationController {
    static async getNotifications(request: FastifyRequest, reply: FastifyReply) {
        const { limit = 50 } = request.query as { limit?: number };
        const notifications = await NotificationService.getNotifications(request.orgId, Number(limit));
        return reply.code(200).send({ data: notifications });
    }

    static async markAsRead(request: FastifyRequest, reply: FastifyReply) {
        const { id } = request.params as { id: string };
        const result = await NotificationService.markAsRead(request.orgId, id);
        if (!result) {
            return reply.code(404).send({ error: 'Not Found', message: 'Notification not found' });
        }
        return reply.code(200).send({ data: result });
    }

    static async clearAll(request: FastifyRequest, reply: FastifyReply) {
        const count = await NotificationService.clearAll(request.orgId);
        return reply.code(200).send({ message: `${count} notifications cleared` });
    }
}
