# Farm triage log (rig1)

Newest on top. Written by the daily triage pipeline: no-LLM collector
script (thresholds + anomaly flags) -> dispatcher agent -> conditional
debugger/reviewer delegation on flags -> commit + operator report.
Fixes are PROPOSALS only; the operator applies them.

---

## 2026-10-07 — HEALTHY
- Flags: none. Max GPU temp 67C (3090), min RAM free 4.46 GiB, mean decode 88.5 tok/s (10 reqs), cache hit 0.80-0.94, load1 max 7.57/32 cores.
- Strata qwen3.8-flash-next-iq3_s warm; VRAM free 433 MiB (above 256 floor); expert cache 24.3 GiB; parking working as expected.

