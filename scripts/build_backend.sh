#!/bin/bash
set -e

# Define root and backend directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

echo "Building zX Backend Wheel..."

# Ensure we are in the backend directory
cd "$BACKEND_DIR"

# Build the wheel using uv
# uv build will place the wheel in backend/dist/ by default
/Users/cianely/.local/bin/uv build

echo "Build complete! Wheel is located in $BACKEND_DIR/dist/"
ls -l "$BACKEND_DIR/dist/"
