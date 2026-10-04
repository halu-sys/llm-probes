# llm-probes — deployment-specific eval probes

## Why this exists (and why it is NOT another lm-eval-harness)

Generic capability benchmarks (MMLU, Q4-vs-Q8 comparisons) already exist —
lm-evaluation-harness, OpenCompass, llama-bench. We do NOT rebuild those.

What nobody has measured: the EXACT deployment running on this machine —
Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S (262k ctx, MTP speculative decoding,
KV-calibrated) and Qwen3.8-27B-Q8_0 (192k ctx, llama.cpp). Generic
--calibrate, served through llama-swap + Strata param rewriting. Published
long-context evals do not cover IQ3_S at 262k with speculation enabled.
Deployment decisions (is 262k real? did calibration hurt? does MTP change
outputs?) require measuring THIS deployment, not someone else's.

Scope is deliberately narrow: ~4 probe types, all procedurally generated
at runtime (no training-data contamination), all graded by CODE
(exact match / execution / schema validation — never by another LLM).

## Probes

### P1 — Needle in haystack (effective context length)
- Generate N tokens of filler (procedural, seeded RNG), embed a random
  needle fact at depth d ∈ {5%, 25%, 50%, 75%, 95%}
- Ask for the needle. Grade: exact match of the random code.
- Sweep ctx sizes: 8k, 32k, 128k, 256k. Output: retrieval rate per depth
  per size → "lost in the middle" curve + effective-context cliff.

### P2 — Speculation identity (MTP correctness)
- Same prompt set, run with speculation ON (current server) vs OFF
  (server restarted without --spec-type; user-controlled).
- Grade: token-level output equality. Any divergence = speculation bug
  in this build/config. (llama.cpp verifies drafts, so identity is the
  expected result; a mismatch is a real finding.)

### P3 — Instruction decay at long context
- System-style instruction block (format rules: "answer as JSON with key
  'x', exactly 3 items, no prose") placed at the START of a long context;
  the question at the END.
- Sweep 8k → 256k. Grade: schema/format validation by code.
- Measures instruction-following degradation, not knowledge.

### P4 — Degeneration/loop rate
- 100 short generations (seeded temp), measure: repetition fraction
  (n-gram repeats), premature EOS rate, max-token hits.
- Grade: pure statistics. Answers "wala namang loops" with n=100, not n=1.

## Architecture

```
runner.ts        — orchestrates: build prompt, POST /v1/chat/completions,
                   parse, grade, record
probes/p1..p4.ts — each probe: generate(seed) -> {prompt, grade(answer)}
report.ts        — scoreboard (terminal table + JSON artifact)
config           — endpoint (:1236), model alias (flash), ctx sizes, N
```

- Node/TS, no framework deps beyond vitest (tests) — the probes are plain
  scripts. All randomness seeded → runs are reproducible.
- Graders are pure functions: (expected, answer) -> pass/fail. Unit-tested.
- Cost model: local, free; wall-clock is the budget. P1 at 256k is the
  slow probe (prefill time) — budgeted per run.

## Gates (same discipline as TaskForge)

- TDD: graders + generators unit-tested BEFORE running against the model.
- Dry run: P1 at 8k first (fast), then scale up.
- Honest limits section in README: what these probes CANNOT tell you
  (creativity, nuance, truthfulness of long-form prose).

## Non-goals

- No generic benchmark suites (lm-eval-harness covers that).
- No LLM-as-judge grading.
- No UI. Terminal + JSON artifacts.
- No 24/7 anything — on-demand runs.
