import { useEffect, useRef, useCallback } from "react";

const WS_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:8000").replace(/^http/, "ws");

type MessageHandler = (data: any) => void;

export function useListingSocket(
  listingId: number | undefined,
  onMessage: MessageHandler,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef<MessageHandler>(onMessage);
  onMessageRef.current = onMessage;

  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!listingId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_BASE}/ws/listings/${listingId}`);

    ws.onopen = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = undefined;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => { ws.close(); };
    wsRef.current = ws;
  }, [listingId]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);
}
