# Self-ops triage pipeline

The farm watches itself. A daily cron pipeline runs unattended,
budgeted, and human-gated:

```
[cron 08:00] farm_triage_collect.py (no LLM, ~0 cost)
   Prometheus range stats (6h) + Strata /metrics + llama-swap probe
   -> threshold flags: GPU temp, VRAM/RAM free, decode tok/s,
      cache hit rate, load1 vs cores
        |
   dispatcher agent (cron session, script output in context)
   -> HEALTHY: one-line log entry, zero delegation
   -> FLAGGED: 1x debugger (root-cause, read-only Prometheus/log
      access), then 1x reviewer (sanity-check the fix proposal)
        |
   triage/LOG.md entry (HEALTHY | WATCH | INCIDENT)
   -> git commit + push -> Telegram report to operator
```

Design notes:

- **Cost-tiered.** The collector is a plain script: flags are computed
  with thresholds, not by an LLM. Delegation happens only on anomaly
  — a healthy day costs one small agent run, not a fan-out.
- **Budgeted fan-out.** Hard cap: 2 subagent delegations per run
  (debugger + reviewer), only when flagged. Consistent with the
  measured boot overhead economics (COSTS.md: ~13.7K tokens per cold
  subagent).
- **Human-gated by construction.** The pipeline may read everything
  and write only its own log. Every fix is a `PROPOSAL — requires
  operator approval, NOT applied`. Serving-stack config is untouchable
  by the pipeline; that is the operator's job (see OPERATIONS.md
  autonomy table).
- **Continuity.** The log doubles as state: the debugger reads the
  last 3 entries so recurring anomalies get trend context, not
  one-shot amnesia.

Collector: `~/.hermes/scripts/farm_triage_collect.py` (copy in
`monitoring/`; live version runs from `~/.hermes/scripts/` — the cron
runner resolves scripts there). Cron job: `farm-triage-daily`, daily
08:00.

Status: **paused by operator** — the pipeline ran live (first HEALTHY
entry, commit 834b361) and is kept here as a portfolio artifact; the
operator does not run unattended agent jobs on the rig. Resume is one
`cronjob resume` away; the design and guardrails are what's on
display, not the schedule.

First live run: 2026-10-07 (manual trigger, then scheduled). The
design and guardrails were written by the pipeline's author; the
operator reviewed the guardrails, not the code.
