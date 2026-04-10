import os
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Optional
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from .runner import ExecutionRunner

app = FastAPI(title="zX Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()
EXPECTED_TOKEN = os.getenv("ZX_API_TOKEN")

# Connection Manager for WebSockets
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Runner state
runners: dict[str, ExecutionRunner] = {}

def verify_token(auth: HTTPAuthorizationCredentials = Depends(security)):
    if not EXPECTED_TOKEN:
        return auth.credentials
    if auth.credentials != EXPECTED_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth.credentials

class ExecuteRequest(BaseModel):
    project_path: str
    db_filename: Optional[str] = "zx_database.csv"
    row_ids: List[int]
    dry_run: bool = False

@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if EXPECTED_TOKEN:
        print(f"[Debug] WS connect. Expected: {EXPECTED_TOKEN[:5]}... Received: {token[:5] if token else 'None'}...")
        if token != EXPECTED_TOKEN:
            print("[Debug] WS Token Mismatch!")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/execute", dependencies=[Depends(verify_token)])
async def execute_exploration(req: ExecuteRequest):
    key = f"{req.project_path}:{req.db_filename}"
    if key not in runners:
        # Define callback to broadcast updates
        async def on_update(data):
            await manager.broadcast({"type": "row_update", "data": data})
        
        runners[key] = ExecutionRunner(
            req.project_path, 
            db_filename=req.db_filename,
            on_update=on_update
        )
    
    runner = runners[key]
    if runner.is_running:
        raise HTTPException(status_code=400, detail="Runner is already active for this file")
    
    # Start background task
    asyncio.create_task(runner.run_rows(req.row_ids, req.dry_run))
    return {"status": "started", "row_count": len(req.row_ids)}

@app.post("/stop", dependencies=[Depends(verify_token)])
async def stop_exploration(project_path: str, db_filename: str = "zx_database.csv"):
    key = f"{project_path}:{db_filename}"
    if key in runners:
        runners[key].stop()
        return {"status": "stopping"}
    return {"status": "not_running"}

def main():
    import uvicorn
    port = int(os.getenv("ZX_PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)

if __name__ == "__main__":
    main()
