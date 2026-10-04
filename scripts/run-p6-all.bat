@echo off
cd /d C:\Users\zo\Projects\llm-probes
echo === qwen27b: 8k, 32k, 128k (6 callers) ===
call node_modules\.bin\tsx.cmd src\run-p6.ts qwen27b 8000 6 1
call node_modules\.bin\tsx.cmd src\run-p6.ts qwen27b 32000 6 1
call node_modules\.bin\tsx.cmd src\run-p6.ts qwen27b 128000 6 1
echo === done. newest result files: ===
dir /b /o-d results\p6-*.json
