from typing import Dict, List
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime
import json

router = APIRouter(prefix="/api/ws/chat", tags=["Chat"])

class ChatConnectionManager:
    def __init__(self):
        # order_id -> list of active websockets
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, order_id: str, websocket: WebSocket):
        await websocket.accept()
        if order_id not in self.active_connections:
            self.active_connections[order_id] = []
        self.active_connections[order_id].append(websocket)
        print(f"[ChatWS] Client connected to order_id={order_id}")

    def disconnect(self, order_id: str, websocket: WebSocket):
        if order_id in self.active_connections:
            if websocket in self.active_connections[order_id]:
                self.active_connections[order_id].remove(websocket)
            if not self.active_connections[order_id]:
                del self.active_connections[order_id]
        print(f"[ChatWS] Client disconnected from order_id={order_id}")

    async def broadcast(self, order_id: str, message_data: dict):
        if order_id in self.active_connections:
            payload = json.dumps(message_data)
            for connection in self.active_connections[order_id]:
                try:
                    await connection.send_text(payload)
                except Exception as e:
                    print(f"[ChatWS] Error broadcasting to connection: {e}")

manager = ChatConnectionManager()

@router.websocket("/{order_id}")
async def chat_websocket_endpoint(websocket: WebSocket, order_id: str):
    await manager.connect(order_id, websocket)
    try:
        while True:
            data_text = await websocket.receive_text()
            try:
                data = json.loads(data_text)
                sender = data.get("sender", "DRIVER")
                text = data.get("text", "")
                
                broadcast_payload = {
                    "id": f"msg_{int(datetime.utcnow().timestamp() * 1000)}",
                    "sender": sender,
                    "text": text,
                    "timestamp": datetime.utcnow().strftime("%H:%M"),
                }
                
                await manager.broadcast(order_id, broadcast_payload)
            except Exception as parse_err:
                print(f"[ChatWS] Invalid JSON payload received: {parse_err}")
    except WebSocketDisconnect:
        manager.disconnect(order_id, websocket)
