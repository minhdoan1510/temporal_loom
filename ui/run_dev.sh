#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Terminate background jobs when this script exits
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

# Navigate to the script's directory
cd "$(dirname "$0")"

echo "🚀 Starting Vite dev server pointing to: https://dev-fin-lending-cs-tool.zalopay.vn"
cd web
VITE_API_TARGET=https://dev-fin-lending-cs-tool.zalopay.vn pnpm run dev &

# Wait for Vite dev server to start on port 5173
echo "⏳ Waiting for dev server to start on http://127.0.0.1:5173 ..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:5173/ > /dev/null; then
    echo "✅ Dev server is ready!"
    break
  fi
  sleep 0.5
done

echo "🖥️ Starting native Lending Claw shell..."
cd ..
ZERO_NATIVE_FRONTEND_URL=http://127.0.0.1:5173/ zig build run
