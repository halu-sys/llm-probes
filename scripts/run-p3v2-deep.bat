@echo off
cd /d C:\Users\zo\Projects\llm-probes
echo === P3 v2 (fixed probe) + strict grade: flash ===
call node_modules\.bin\tsx.cmd src\run-p3.ts flash 8000,32000,128000,256000 1
echo === P3 v2 + strict: qwen27b (160k = deepest that fits 192k ctx with 8k completion) ===
call node_modules\.bin\tsx.cmd src\run-p3.ts qwen27b 8000,32000,128000,160000 1
echo === P1 depth at 160k for qwen27b (deeper than 128k) ===
call node_modules\.bin\tsx.cmd src\run-p1.ts qwen27b 160000 5,50,95 1
echo === done ===
dir /b /o-d results\p3-*.json results\p1-*.json
