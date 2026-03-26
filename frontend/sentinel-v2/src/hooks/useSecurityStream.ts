import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../lib/store';

export interface StreamEvent {
  id: string;
  type: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  payload: Record<string, any>;
}

export function useSecurityStream({ maxEvents = 100 }: { maxEvents?: number } = {}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const envWsUrl = import.meta.env.VITE_WS_URL;
    const wsUrl = envWsUrl || `${wsProtocol}//${window.location.host}/ws?token=${accessToken}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => { setIsConnected(true); setError(null); };

        ws.onmessage = async (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.type === 'connected') return;

            if (typeof data.payload === 'string') {
              const masterKey = useAuthStore.getState().masterKey;
              if (masterKey) {
                const { CryptoService } = await import('../lib/services/crypto.service');
                const decrypted = await CryptoService.decryptPayload(data.payload, masterKey);
                if (decrypted) data.payload = decrypted;
              }
            }
            setEvents((prev) => [data, ...prev].slice(0, maxEvents));
          } catch { /* ignore parse errors */ }
        };

        ws.onerror = () => { setError('WebSocket connection error'); setIsConnected(false); };

        ws.onclose = (e) => {
          setIsConnected(false);
          if (e.code !== 4001 && e.code !== 1000) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch {
        setError('Failed to open WebSocket connection');
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.close(1000, 'Component unmounted'); wsRef.current = null; }
    };
  }, [accessToken, maxEvents]);

  return { events, isConnected, error };
}
