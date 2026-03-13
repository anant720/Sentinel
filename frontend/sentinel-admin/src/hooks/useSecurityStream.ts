/**
 * src/hooks/useSecurityStream.ts
 * ─────────────────────────────────────────────────
 * WebSocket hook for real-time security event streaming.
 * Connects to the backend WS endpoint with JWT auth.
 * Falls back gracefully if connection fails.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../lib/store';

export interface StreamEvent {
  id: string;
  type: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, any>;
}

interface UseSecurityStreamOptions {
  maxEvents?: number;
}

export function useSecurityStream({ maxEvents = 100 }: UseSecurityStreamOptions = {}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    // Resolve WS URL from current origin  
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Detect if running locally and connect directly to backend
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsHost = isLocal ? 'localhost:3001' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${accessToken}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

        ws.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data);
            // Skip the "connected" handshake message
            if (data.type === 'connected') return;
            setEvents((prev) => [data, ...prev].slice(0, maxEvents));
          } catch {
            // Ignore unparseable messages
          }
        };

        ws.onerror = () => {
          setError('WebSocket connection error');
          setIsConnected(false);
        };

        ws.onclose = (e) => {
          setIsConnected(false);
          // Auto-reconnect after 5s unless closed intentionally (code 4001 = unauthorized)
          if (e.code !== 4001 && e.code !== 1000) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch (err) {
        setError('Failed to open WebSocket connection');
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [accessToken, maxEvents]);

  return { events, isConnected, error };
}
