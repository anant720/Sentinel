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

    // Resolve WS URL from environment or current origin  
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const envWsUrl = import.meta.env.VITE_WS_URL;
    const wsUrl = envWsUrl || `${wsProtocol}//${window.location.host}/ws?token=${accessToken}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ Security Stream WebSocket connected to:', wsUrl);
          setIsConnected(true);
          setError(null);
        };

        ws.onmessage = async (msg) => {
          try {
            const data = JSON.parse(msg.data);
            if (data.type === 'connected') return;

            // E2EE Decryption Attempt
            if (typeof data.payload === 'string') {
              const masterKey = useAuthStore.getState().masterKey;
              if (masterKey) {
                const { CryptoService } = await import('../lib/services/crypto.service');
                const decrypted = await CryptoService.decryptPayload(data.payload, masterKey);
                if (decrypted) {
                  data.payload = decrypted;
                }
              }
            }

            setEvents((prev) => [data, ...prev].slice(0, maxEvents));
          } catch (err) {
            console.warn('⚠️ WS Message parse error:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('❌ Security Stream WebSocket Error:', err);
          setError('WebSocket connection error');
          setIsConnected(false);
        };

        ws.onclose = (e) => {
          console.log(`ℹ️ Security Stream WebSocket Closed (Code: ${e.code}, Reason: ${e.reason || 'None'})`);
          setIsConnected(false);
          if (e.code !== 4001 && e.code !== 1000) {
            console.log('🔄 Attempting reconnection in 5s...');
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch (err) {
        console.error('❌ Failed to initialize WebSocket:', err);
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
