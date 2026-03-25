import os
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional

app = FastAPI(title="zX Backend")
security = HTTPBearer()

# Token should be passed from Electron on startup via environment variable
EXPECTED_TOKEN = os.getenv("ZX_API_TOKEN")

def verify_token(auth: HTTPAuthorizationCredentials = Depends(security)):
    if not EXPECTED_TOKEN:
        # In development, if no token is set, we might allow it or log a warning
        # For now, let's keep it strict or allow 'dev-token'
        return auth.credentials
    
    if auth.credentials != EXPECTED_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth.credentials

@app.get("/health")
async def health_check(token: str = Depends(verify_token)):
    return {"status": "ok", "version": "0.1.0"}

def main():
    import uvicorn
    port = int(os.getenv("ZX_PORT", 8000))
    # Using 127.0.0.1 for local health-check and REST calls
    uvicorn.run(app, host="127.0.0.1", port=port)

if __name__ == "__main__":
    main()
