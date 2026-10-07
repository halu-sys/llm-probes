# Operating an 11-profile agent farm: guardrails, HITL, incident practice

How this farm runs day-to-day: what the agents may do alone, what
requires a human, how cost and context are bounded, and what happens
when an agent misbehaves. Written as an operator's runbook, not
architecture marketing.

## Topology

- llama-swap (:1236) fronts one Strata server (single model, 11 role
  aliases). `exclusive: true` group routing; preload on startup.
- Hermes gateway spawns role profiles (orchestrator = parent; 10
  worker profiles). Each profile: own SOUL.md persona, own toolset
  allowlist, own sampling profile (reasoning roles: high effort,
  temp 1.0/top_p 0.95; body roles: low effort, temp 0.7; compress:
  greedy). Per-alias sampling is set at the proxy, not the client —
  clients cannot override it.
- Context budget is enforced at three layers (serving 196608 / proxy
  aliases / harness context_length). The binding constraint is the
  smallest one; case study #5 is what that lesson cost.

## Autonomy model (what runs unattended)

Read-only is autonomous. Anything consequential is gated:

| action class | policy |
|---|---|
| read files, search, run analysis, fetch web | autonomous |
| edit files inside the workspace | autonomous (git is the safety net; every change is a commit, rollback = revert) |
| destructive ops (rm outside workspace, kill processes, GPU resets) | human approval at the tool-call level |
| config changes to the live serving stack | human approval; experiments use separate configs on separate ports, never the live one |
| spending money / cloud calls | structurally impossible — no API keys configured; the farm is local-first by design |
| publishing / sending externally | human approval |

The structural version of "human in the loop": the agent proposes,
the operator approves, and the approval prompt must be *legible* —
narrow write tools with clear blast radius beat coarse ones (a
one-line config diff is approvable at a glance; a full-config rewrite
is not).

## Cost and context guardrails

- Boot payload is measured (COSTS.md): 13.7K tokens per cold
  subagent. Fan-out width and delegation depth are sized against
  that, not against task size.
- Per-profile toolsets: workers get only the tools their role needs
  (fewer schemas = cheaper boot + smaller blast radius).
- Loop guards: per-run turn caps; degeneration is a measured failure
  mode (P4: n-gram repetition + premature EOS), not folklore.
- Completion budgets: reasoning models here never run under 8k
  completion tokens (case study #2: silent empty answers below that).
- Conversation parking: long idle sessions are evicted to snapshots
  (2 slots, 4 GB ceiling, min-free floor) instead of holding VRAM.

## Incident practice

When an agent misbehaves, the pipeline is: reproduce with the saved
session -> bisect layers (client params -> proxy config -> server
flags -> model behavior) -> fix at the lowest layer that explains it
-> encode the incident as a probe or a test so it can't return
silently. Eight of these are written up in CASE-STUDIES.md; three
generalize:

1. **Surprising eval result? Audit the plumbing first.** Two of the
   eight incidents were the harness lying (stripParams case, probe
   contradiction case), not the model.
2. **Silent failure modes need explicit surfacing.** finish_reason,
   truncation flags, empty-answer warnings — recorded on every call,
   because "model returned nothing" and "budget ate the answer" look
   identical downstream.
3. **Grade artifacts, not behavior.** The farm's agents execute
   differently (steppers vs batchers); the contract is what they
   leave behind — files on disk, exact outputs, bounded cost.

## What this stack is NOT

- Not an MLOps pipeline: no training, no model lifecycle; this is
  runtime operations of a fixed serving stack.
- Not a benchmark suite: public evals cover generic capability; the
  probes here answer deployment-specific questions only this machine
  can answer.
- Not cloud-parity on quality: local IQ3_S quant trails frontier
  hosted models. The value is zero-marginal-cost iteration, data
  control, and owning the failure modes — which is exactly what
  produced the evidence in this repo.
