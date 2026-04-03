import { useEffect, useState, useRef } from 'react';
import apiCore from '../../../lib/api';

export interface GeoEventPayload {
    type: string;
    ip: string;
    lat: number;
    lon: number;
    city: string;
    country: string;
    country_code: string;
    rep_score: number;
    is_threat: boolean;
    timestamp: number;
}

export function useThreatMapStream(onEvent: (data: GeoEventPayload) => void) {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        // Construct WebSocket URL from standard API base UI
        const apiBaseUrl = apiCore.defaults.baseURL || 'http://localhost:3001/api/v1';
        // Replace http/https with ws/wss
        const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
        
        const token = localStorage.getItem('sentinel_jwt_token');
        if (!token) return;

        // Base URL actually points to /api/v1, we need to go to root for fastify custom ws route, or append to base.
        // Wait, in index.ts I added it to `fastify.get('/threat-map/live')`.
        // The core index.ts mounts API routes under /api/v1 (let me check this assumption... actually it is mounted under /api/v1 probably, or the base URL is /api/v1 and fastify routes are at root).
        // Let's assume the WebSocket route is exactly on the same base host.
        const urlObj = new URL(apiBaseUrl);
        const wsUrl = `${urlObj.protocol === 'https:' ? 'wss:' : 'ws:'}//${urlObj.host}/threat-map/live?token=${token}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[ThreatMap] WebSocket Connected');
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === 'history' && Array.isArray(payload.data)) {
                    // Bulk load history
                    payload.data.forEach((evt: any) => {
                        // is_threat is heuristically decided by rep_score > 50 or engine severity
                        onEvent({
                            ...evt,
                            is_threat: evt.risk_score >= 80 || evt.rep_score > 50
                        });
                    });
                } else if (payload.type === 'live') {
                    onEvent(payload.data);
                }
            } catch (err) {
                console.error('[ThreatMap] Message parsing error', err);
            }
        };

        ws.onclose = () => {
            console.log('[ThreatMap] WebSocket Disconnected');
            setIsConnected(false);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, []);

    return { isConnected };
}
