#!/usr/bin/env bash
# P6 sweep — run this yourself in git-bash:
#   cd /c/Users/zo/Projects/llm-probes && bash scripts/run-p6-all.sh
# Results: results/p6-<timestamp>.json (one file per size, saved even if a
# later size fails). Progress prints per run.
cd "$(dirname "$0")/.." || exit 1

echo "=== flash: 32k, 128k, 256k (6 callers) ==="
./node_modules/.bin/tsx src/run-p6.ts flash 32000 6 1
./node_modules/.bin/tsx src/run-p6.ts flash 128000 6 1
./node_modules/.bin/tsx src/run-p6.ts flash 256000 6 1

echo "=== qwen27b: 8k, 32k, 128k (6 callers) ==="
./node_modules/.bin/tsx src/run-p6.ts qwen27b 8000 6 1
./node_modules/.bin/tsx src/run-p6.ts qwen27b 32000 6 1
./node_modules/.bin/tsx src/run-p6.ts qwen27b 128000 6 1

echo "=== done. files: ==="
ls -t results/ | grep p6 | head -8
