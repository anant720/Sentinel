import { FastifyRequest, FastifyReply } from 'fastify';
import { DashboardService } from '../services/dashboard.service.js';

export class DashboardController {
    static async getMetrics(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const metrics = await DashboardService.getAggregateMetrics(orgId);
        return reply.code(200).send(metrics);
    }

    static async getRisk(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const riskData = await DashboardService.getRiskDistribution(orgId);
        return reply.code(200).send(riskData);
    }

    static async runScan(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const result = await DashboardService.runSecurityScan(orgId, 1440); // 24h window for meaningful score
        // Persist the score so the chart updates immediately
        await DashboardService.snapshotRiskScore(orgId);
        return reply.code(200).send(result);
    }

    static async getHistoricalRisk(request: FastifyRequest, reply: FastifyReply) {
        const orgId = request.orgId;
        const { range = '1d' } = request.query as any;
        const result = await DashboardService.getHistoricalRisk(orgId, range);
        return reply.code(200).send(result);
    }

}
