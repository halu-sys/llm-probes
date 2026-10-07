# Case studies: failure modes from a production local-LLM agent stack

Six incidents from running a 2-GPU llama.cpp/Strata farm (RTX 3090 +
4070 Ti Super) serving an 11-profile multi-agent Hermes stack via
llama-swap. Each: symptom → diagnosis → root cause → fix → prevention.
All real, all logged at the time.

---

## 1. The eval that measured the wrong thing (stripParams ate the temperature)

**Symptom.** MTP speculation-identity probe (P2): 0/10 byte-identical
outputs between spec-on and spec-off runs. Looked like speculative
decoding was corrupting outputs — a scary claim.

**Diagnosis.** Before blaming the decode path, checked what the server
actually received. llama-swap's `stripParams` was silently removing
`temperature` from requests, so both arms sampled at the model default
(0.6) instead of temp 0. Two independent sampling runs are never
byte-identical — the probe was measuring sampling noise, not speculation.

**Fix.** Dedicated probe instance without `stripParams`, temp 0. Re-run:
8/10 byte-identical vs no-spec; control rerun (same config twice) 10/10,
confirming determinism. The 2 divergences started late in reasoning with
identical token counts — benign.

**Prevention.** Any probe that claims determinism must first verify the
server honors the params it was given. A control arm (same config twice)
is mandatory before comparing configs.

**Lesson.** When a probe's result is surprising, the first suspect is
the probe's plumbing, not the system under test.

---

## 2. Reasoning models eat their own answer budget (silent empty answers)

**Symptom.** P3/P6 probes: occasional completely empty answers at
moderate context sizes (32k) — not truncation mid-sentence, nothing.

**Diagnosis.** The model is a reasoning model: it emits
`reasoning_content` before `content`. With a 4096-token completion
budget, reasoning consumed the entire budget and `content` came back
empty. `finish_reason` told the story once we recorded it.

**Fix.** ≥8k completion budgets for all reasoning-model calls; runners
now record finish reason + a truncation flag; empty-answer warning flag
in the harness.

**Prevention.** Deployment rule adopted farm-wide: reasoning models
here never run with <8k completion budget. Harness surfaces finish
reason on every call so this can never be silent again.

**Lesson.** Local stacks make failure modes visible that APIs hide.
"Silently vanished answer" is an operator skill: read finish_reason,
know your model's reasoning overhead.

---

## 3. The probe bug that flipped the conclusion (P3 v1)

**Symptom.** P3 (instruction-following at depth) showed flash
"MERGING" two required items at long context — read as model
degradation.

**Diagnosis.** Strict per-item re-grade exposed the probe itself as
buggy: the v1 instruction demanded "exactly 3 items" while the question
asked for a sum + 3 words = 4 items — a contradiction. Both models
reconciled it: flash merged two words (preserving all content), qwen27b
dropped a word (losing content). The "degradation" was our bug, and
flash's reconciliation was the *better* of the two responses.

**Fix.** P3 v2 with consistent 4-item instruction; strict re-runs marked
`strict` in output. v1 results kept as-is with the bug documented.

**Prevention.** Graders are stricter than prompts: a strict grader
catches probe contradictions that lenient grading hides. Probe fixes
never overwrite history — both versions ship with a note.

**Lesson.** Calibrated skepticism applies to your own harness first.
The strongest eval signal here was finding that the "bad model behavior"
was actually good model behavior against a bad spec.

---

## 4. HTTP client timeout killed model swaps (undici's unraisable 300s)

**Symptom.** Long-running A/B sweeps died on requests that hit a model
swap (unload flash, load 26GB qwen27b) — connection reset around 5 min,
inconsistently.

**Diagnosis.** Node's global `fetch` (undici) enforces a 300s
`headersTimeout` that cannot be raised via fetch init options. Model
swaps legitimately take longer (big load + health-check wait).

**Fix.** Replaced `fetch` with `node:http` directly in the probe client,
with an explicit raisable socket timeout. Verified with a smoke test
across a real swap.

**Prevention.** Client timeouts must exceed worst-case server startup,
not typical response time. llama-swap `startupHealthCheckTimeout` was
also raised (60 → 300s) to match reality (model load takes 1–3 min).

**Lesson.** Production debugging on a local stack means reading the
runtime's actual constraints, not trusting the API surface.

---

## 5. Context length silently capped by model-name matching

**Symptom.** Hermes sessions compressed far earlier than the configured
163k context; long agent sessions lost early-conversation constraints.

**Diagnosis.** `model_metadata.py` had a hardcoded rule: any model name
containing "qwen" → 131k context. It overrode the configured value, so
the harness thought the window was 32k smaller than it was.

**Fix.** Configured context honored (now 196608 server-side, patched
across main config + all 11 subagent profiles).

**Prevention.** Verify effective context length at the endpoint
(`/health` reports `max_context`), not just in config. Any
name-matching metadata heuristic is a landmine for custom-quant model
names.

**Lesson.** Three layers (serving, proxy, harness) each hold a context
number; the binding constraint is the smallest one nobody documented.

---

## 6. Delegation chains survive arithmetic, fail on labels (P7)

**Symptom.** New system-level probe: a task passed hop-to-hop through
role-routed agents (orchestrator→coder→tester...), each hop applying an
arithmetic step while carrying a secret code, a strict 3-line format,
and forbidden-word constraints. Parallel fan-out variant: 2–4 workers,
merge must keep every fact.

**Results (flash IQ3_S, temp 0, greedy).** Chain: 2 hops 1/3, 3 hops
3/3, 5 hops 3/3. Fan-out: 2/2, 4/4. The two failures were NOT the
arithmetic and NOT the carried code — both were a single-character
label typo (`NOTS:` instead of `NOTES:`), at 2 hops, not at 5.

**Also found.** The same seed that passed in the smoke run failed in the
sweep — temp 0, greedy, same config. Decode on this stack is still
batching-dependent (MTP speculation + 2 concurrent batch slots),
consistent with P2's late-reasoning divergences.

**Interpretation.** Multi-hop composition (the scary part) is solid on
this stack; exact string-format compliance is the brittle part. That
inverts the usual assumption that deep chains degrade.

**Mitigations (operator layer, not model layer).**
- Parse handoffs leniently (regex on `NOT[S]?ES`), emit a drift warning,
  keep the strict grade — drift is a signal, don't hide it.
- Where exact format matters downstream, use structured handoff (JSON)
  with schema validation + one retry, instead of trusting label
  fidelity.
- Never treat greedy local decode as bit-reproducible across concurrent
  load; design evals with seeds-per-cell, not single runs.

**Lesson.** "Solid output" is not one property. This stack passes
5-hop fact composition and fails on a 5-letter label — a portfolio that
only shows the passes would be lying.

---

## 7. Every subagent pays ~14K tokens of boot overhead (P8)

**Symptom.** P8 spawns real Hermes subagents (`hermes -p <profile> -z`)
and reads the gateway's usage file. A one-line arithmetic answer cost
~13.6-13.9K input tokens before any output.

**Diagnosis.** That is the per-subagent boot payload: SOUL.md persona +
tool schemas + memory injection, resent on every fresh session. It is
invisible to model-level probes (P1-P6) and serving-level probes (P7) —
only the agent-stack layer can see it.

**Also found.**
- The orchestrator profile's tool task: file written correctly on disk,
  but the reply line was `WROTE` with the filename dropped — a
  persona-dependent format slip (21/22 overall).
- Usage accounting is inconsistent across runs: some tool tasks report
  ~270 input tokens (prompt-cache hits counted differently) while
  siblings report ~13.9K. Treat per-task token accounting as directional
  until the cache semantics are understood; averages across a profile
  are the usable number.

**Operator implications.**
- Boot payload is the real budget consumer in fan-out: 5 subagents x
  14K = 70K tokens before any task content. Size fan-out width and
  delegation depth against this, not just against task size.
- Profile SOUL.md files are cost-bearing assets: every KB added to a
  persona is paid by every delegation to that profile.
- Grade subagent output structurally (file on disk + regex on reply),
  never by trusting the completion flag — the orchestrator case shows
  `completed=true` with a contract-violating reply.

**Lesson.** The cheapest-looking agent call is the most expensive line
item. Measure the harness, not just the model.

---

## 8. Two working styles in one farm: steppers vs batchers (P8 chain-12)

**Symptom.** 12-step two-file task (alternating appends across files A
and B, read-back verification, per-file sums + grand total). All 10
profiles pass the artifact contract — but call counts split into two
clusters: 15-16 calls (planner, architect, debugger, reviewer,
researcher, documentor, prompter) vs 5-10 calls (coder, tester,
refactorer).

**Diagnosis.** The low-call profiles batch multiple appends into fewer
tool calls. Files on disk are byte-exact and sums correct in both
clusters — batching is efficiency, not skipped work. A naive grader
that fails "too few calls" would falsely fail efficient agents; the
first version of this grader did exactly that to coder.

**Fix.** Grading split into two axes: `pass` = artifact contract
(completed + correct answer + format + files exact + no loop/token
overflow), `processOk` = step-window adherence, reported separately.
Skipped steps with WRONG files are still caught by the file check —
the artifact check subsumes the dishonesty case.

**Prevention.** Grade what the agent leaves behind, not how it moved.
Process signals are telemetry for tuning (cost, latency), not verdicts.
Note: batching also cuts cost — batchers ran 2-3x fewer round-trips at
similar wall time.

**Lesson.** Same farm, same model, different personas produce
structurally different execution styles. An operator's eval must be
style-agnostic on the artifact axis and style-aware on the cost axis.
