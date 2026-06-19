#!/usr/bin/env bash
set -e

echo "Syncing dependencies via uv..."
uv pip install -e .

echo "Building standalone backend binary with PyInstaller..."
# We explicitly specify some hidden imports that FastAPI/Uvicorn might need
uv run pyinstaller \
    --name zx-backend \
    --onefile \
    --hidden-import uvicorn \
    --hidden-import fastapi \
    --hidden-import pydantic \
    --hidden-import starlette \
    --hidden-import pymoo \
    --hidden-import pandas \
    --hidden-import plotly \
    run_backend.py

echo "Build complete! Executable is located at: ./dist/zx-backend"
