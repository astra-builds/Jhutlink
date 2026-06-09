# backend/api/websocket.py
# JhutLink — WebSocket Connection Manager & Real-Time Bid Broadcast

import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("jhutlink.ws")

# ---------------------------------------------------------------------------
# Connection Manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    """
    Tracks WebSocket connections per listing_id.
    
    Design:
        - One set of WebSocket connections per listing.
        - Bid events push to all connections for that listing.
        - Connections are cleaned up on disconnect.
    """

    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, listing_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.setdefault(listing_id, set()).add(ws)
        logger.info("WS connected: listing=%d, total=%d", listing_id, len(self._connections[listing_id]))

    def disconnect(self, listing_id: int, ws: WebSocket) -> None:
        conns = self._connections.get(listing_id)
        if conns:
            conns.discard(ws)
            if not conns:
                self._connections.pop(listing_id, None)
        logger.info("WS disconnected: listing=%d", listing_id)

    async def broadcast(self, listing_id: int, data: dict[str, Any]) -> None:
        conns = self._connections.get(listing_id)
        if not conns:
            return
        message = json.dumps(data, default=str)
        stale: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            conns.discard(ws)


manager = ConnectionManager()
