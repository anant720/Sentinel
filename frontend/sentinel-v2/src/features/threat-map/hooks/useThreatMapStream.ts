import { useEffect, useState, useRef, useCallback } from 'react';

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

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;

function buildWsUrl(token: string): string {
    // Priority 1: explicit env var pointing to the backend
    const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
    if (backendUrl) {
        const wsProto = backendUrl.startsWith('https') ? 'wss' : 'ws';
        const host = backendUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `${wsProto}://${host}/threat-map/live?token=${token}`;
    }
    // Priority 2: same host as the page (works for local dev proxied setups)
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${wsProto}://${window.location.host}/threat-map/live?token=${token}`;
}

export function useThreatMapStream(onEvent: (data: GeoEventPayload) => void) {
    const [isConnected, setIsConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const retryCount = useRef(0);
    const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMounted = useRef(true);
    // Keep stable ref to callback so reconnects always use the latest version
    const onEventRef = useRef(onEvent);
    onEventRef.current = onEvent;

    const connect = useCallback(() => {
        if (!isMounted.current) return;

        const token = localStorage.getItem('sentinel_jwt_token');
        if (!token) {
            console.warn('[ThreatMap] No JWT token found — WebSocket skipped.');
            return;
        }

        const wsUrl = buildWsUrl(token);
        console.log(`[ThreatMap] Connecting to ${wsUrl} (attempt ${retryCount.current + 1})`);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            if (!isMounted.current) return;
            console.log('[ThreatMap] WebSocket Connected');
            setIsConnected(true);
            retryCount.current = 0; // reset backoff on success
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload.type === 'history' && Array.isArray(payload.data)) {
                    payload.data.forEach((evt: any) => {
                        onEventRef.current({
                            ...evt,
                            is_threat: evt.risk_score >= 80 || evt.rep_score > 50,
                        });
                    });
                } else if (payload.type === 'live') {
                    onEventRef.current(payload.data);
                }
            } catch (err) {
                console.error('[ThreatMap] Message parsing error', err);
            }
        };

        ws.onerror = (err) => {
            console.error('[ThreatMap] WebSocket error', err);
        };

        ws.onclose = (event) => {
            if (!isMounted.current) return;
            console.log(`[ThreatMap] WebSocket closed (code=${event.code})`);
            setIsConnected(false);

            // Don't retry on auth failures (1008 = Policy Violation / token invalid)
            if (event.code === 1008 || event.code === 1000) return;

            if (retryCount.current < MAX_RETRIES) {
                const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount.current);
                retryCount.current += 1;
                console.log(`[ThreatMap] Retrying in ${delay}ms…`);
                retryTimer.current = setTimeout(connect, delay);
            } else {
                console.warn('[ThreatMap] Max retries reached. Giving up.');
            }
        };
    }, []);

    useEffect(() => {
        isMounted.current = true;
        connect();

        return () => {
            isMounted.current = false;
            if (retryTimer.current) clearTimeout(retryTimer.current);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.close(1000, 'Component unmounted');
            }
        };
    }, [connect]);

    return { isConnected };
}
