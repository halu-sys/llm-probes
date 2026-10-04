#!/usr/bin/env bash
# P2 experiment, one shot: unload flash -> probe instance -> 3 phases -> cleanup
set -x
cd /c/Users/zo/Projects/llm-probes

# 1. free VRAM: unload flash from the main :1236 instance
curl -s "http://localhost:1236/unload"
sleep 5
nvidia-smi --query-gpu=index,memory.used --format=csv,noheader

# 2. launch probe instance on :1237
"/d/LLAMASWAP/llama-swap.exe" -listen ":1237" -config "D:/LLAMASWAP/updated/config-p2probe.yaml" &
SWAP_PID=$!
sleep 3
curl -s http://localhost:1237/v1/models | head -c 300

# 3. three phases (each triggers model load/swap on :1237)
./node_modules/.bin/tsx src/run-p2.ts q27-mtp probe-mtp http://localhost:1237/v1
./node_modules/.bin/tsx src/run-p2.ts q27-nospec probe-nospec http://localhost:1237/v1
./node_modules/.bin/tsx src/run-p2.ts q27-nospec probe-nospec2 http://localhost:1237/v1

# 4. cleanup: graceful shutdown of probe instance; flash reloads on next request
curl -s "http://localhost:1237/shutdown"
sleep 3
kill $SWAP_PID 2>/dev/null
nvidia-smi --query-gpu=index,memory.used --format=csv,noheader
echo DONE
