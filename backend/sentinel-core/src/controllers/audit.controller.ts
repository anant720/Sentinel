import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../lib/database.js';

export class AuditController {
    static async getLogs(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const { limit = 50, offset = 0 } = request.query as any;

        const result = await db.query(
            `SELECT u.email as user_email, a.action, a.resource_type, a.resource_id, a.metadata, a.ip_address, a.created_at
             FROM audit_logs a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.organization_id = $1
             ORDER BY a.created_at DESC
             LIMIT $2 OFFSET $3`,
            [orgId, limit, offset]
        );

        return { data: result.rows };
    }

    static async exportLogs(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;

        // Fetch up to 10,000 most recent audit logs for the requesting org
        const result = await db.query(
            `SELECT u.email as user_email, a.action, a.resource_type, a.resource_id, a.ip_address, a.created_at
             FROM audit_logs a
             LEFT JOIN users u ON a.user_id = u.id
             WHERE a.organization_id = $1
             ORDER BY a.created_at DESC
             LIMIT 10000`,
            [orgId]
        );

        if (result.rows.length === 0) {
            return reply.code(404).send({ error: 'Not Found', message: 'No audit logs found for export.' });
        }

        // Generate CSV String (RFC 4180 compatible fallback)
        const headers = ['Timestamp', 'User Email', 'Action', 'Resource Type', 'Resource ID', 'IP Address'];

        const rows = result.rows.map((r: any) => {
            return [
                new Date(r.created_at).toISOString(),
                r.user_email || 'System',
                r.action,
                r.resource_type || '',
                r.resource_id || '',
                r.ip_address || ''
            ];
        });

        // Simple CSV stringifier escaping inner quotes
        const csvContent = [
            headers.join(','),
            ...rows.map((row: any[]) => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `audit_logs_${timestamp}.csv`;

        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        return reply.send(csvContent);
    }
}
