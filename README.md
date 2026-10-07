# llm-probes

Deployment-specific eval probes for a local llama.cpp/llama-swap stack.
NOT another lm-eval-harness — see docs/SPEC.md for why.

Answers questions only THIS machine can answer:
- Is 262k context real at IQ3_S quantization? (P1)
- Does format-following survive long context? (P3)
- What is the actual loop/degeneration rate? (P4)
- Does MTP speculation change outputs? (P2, llama.cpp servers only)
- Can the model COMPOSE facts scattered across context, not just retrieve
  one? Five function defs at 2/25/50/75/98% depth; answer f5(f4(f3(f2(f1(seed))))). (P5)
- Does it understand a 250k-token synthetic CODEBASE — find every caller
  of a core function scattered across files, no false positives? (P6)
- SYSTEM-level (not model-level): does a task survive a multi-hop agent
  delegation chain — value composed across hops, secret code carried,
  constraints obeyed — and does a parallel fan-out merge keep every
  worker's fact? (P7, routes each hop by llama-swap role alias)

All probes are procedurally generated at runtime (seeded, reproducible,
no training-data contamination) and graded by CODE (exact match, JSON
schema, statistics) — never by another LLM.

## Usage

```
npx vitest run                                  # unit tests (graders/generators)
./node_modules/.bin/tsx src/run-p1.ts flash 8000,32000,128000,256000 5,50,95 1
./node_modules/.bin/tsx src/run-p3.ts flash 8000,32000,128000,256000 1
./node_modules/.bin/tsx src/run-p4.ts flash 20
./node_modules/.bin/tsx src/run-p5.ts flash 8000,32000,128000,256000 1
./node_modules/.bin/tsx src/run-p6.ts flash 8000,32000,128000,256000 6 1
./node_modules/.bin/tsx src/run-p7.ts flash 2,3,5 1        # chain (hops, role-routed)
./node_modules/.bin/tsx src/run-p7.ts flash 2,4 1 --fan    # parallel fan-out + merge
./node_modules/.bin/tsx src/run-p8.ts orchestrator,coder,tester 1 --tool  # real Hermes subagents (sequential)
```

Results land in `results/*.json` + a terminal scoreboard.

## Results so far (flash = Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S, 262k ctx, MTP spec, llama-swap :1236; qwen27b = Qwen3.8-27B-Q8_0, 192k ctx — retired 2026-10-05, comparison columns are point-in-time, not maintained)

| probe | flash (IQ3_S, Strata, 262k) | qwen27b (Q8, llama.cpp, 192k) |
|---|---|---|
| P1 needle, depths 5/50/95% | **30/30 PASS** 8k–256k (2 seed sets) | **12/12 PASS** 8k–160k |
| P3 instruction decay | **4/4 PASS** to 256k (minor item-merge) | **3/3 PASS** to 128k (clean) |
| P3 v2 (fixed probe, strict per-item grade) | **4/4 strict** 8k–256k | **4/4 strict** 8k–160k |
| P4 degeneration, n=20 | 0 loops, 0% rep | 0 loops, 0% rep |
| P2 MTP speculation identity | N/A — MTP is Strata's decode path | **8/10 byte-identical** vs no-spec; control rerun 10/10 |
| P5 multi-hop chain (5 scattered defs, compose f1..f5) | **4/4 PASS** 8k–256k | **4/4 PASS** 8k–128k |
| P6 codebase caller-graph (6 callers scattered, 250k-tok doc) | **5/5 PASS** 8k–256k | 2/3 — 32k FAIL was empty answer (reasoning exhausted 4096-token budget), 128k PASS |
| P7a delegation chain (role-routed hops) | **7/9** — 2h: 1/3, 3h: 3/3, 5h: 3/3 | n/a |
| P7b parallel fan-out + merge | **4/4** — 2w: 2/2, 4w: 2/2 | n/a |
| P8 Hermes agent stack (10 profiles x answer+tool) | **21/22** — only fail: orchestrator wrote the file correctly but replied `WROTE` without the filename | n/a |
| P8 chain-12 two-file task (10 profiles) | **20/20** — files exact on disk, sums correct; 3 profiles batched steps (proc-deviation, not failure) | n/a |

P5 note: added after review feedback that P1 only measures single-fact
retrieval. P5 requires locating five definitions at 2/25/50/75/98% depth
AND composing them into one computation — retrieval + reasoning.
Still n=1/cell; treat passes as strong indication, not proof.

P6 note: synthetic multi-file Python codebase (seeded, unique names, no
training-data contamination); question = list every caller of a core
function, graded by exact set match + false-positive check. The one
qwen27b FAIL at 32k was an EMPTY answer: reasoning_content consumed the
entire 4096-token budget before content was emitted. Same failure mode
seen in P3 at 2048 tokens. Deployment lesson: reasoning models on this
stack need >=8k completion budgets or answers silently vanish.

P2 note: first attempt showed 0/10 divergence — cause was llama-swap
`stripParams` removing `temperature`, so runs sampled at temp 0.6.
Re-run on a dedicated probe instance (temp 0, no stripParams) gave the
numbers above: speculation is lossless on all answer-critical cases;
2 divergences started late in reasoning with identical token counts.

P3 probe v1 bug (found by strict re-grade): the v1 instruction demanded
"exactly 3 items" while the question asked for sum + 3 words = 4 items —
a contradiction. Both models reconciled it: flash MERGED two words
("lima charlie", preserving all content), qwen27b DROPPED a word (losing
content). The earlier "flash item-merge degradation" observation was
wrong — it was our probe's fault, and flash's reconciliation was the
better of the two. v1 results are kept as-is; v2 (consistent 4-item
instruction) re-runs are marked strict in the runner output.

Caveats: n=1 per cell is a smoke test, not statistics. Rerun with more
seeds for confidence. P1 filler is prose-like; adversarial fillers
(repetitive code, tables) stress KV cache differently. P7 cells use
n=2-3; its 2 chain FAILs were format-label typos, not composition
failures — see CASE-STUDIES.md #6.

## Case studies

Eight production incidents (symptom → diagnosis → root cause → fix →
prevention) in [CASE-STUDIES.md](CASE-STUDIES.md): param-stripping
invalidating an eval, reasoning budgets silently eating answers, a
probe bug that flipped a conclusion, an unraisable HTTP timeout,
context caps from name-matching metadata, P7's delegation findings,
agent boot economics, and steppers-vs-batchers grading.

## Operations & cost

Runtime operations of the machine this suite measures — guardrails
runbook, cost ledger, observability stack, triage pipeline — live in
the companion repo: [halu-sys/llm-ops](https://github.com/halu-sys/llm-ops).

## Honest limits

- Measures retrieval + format-following + degeneration. Does NOT measure
  truthfulness of long-form prose, creativity, or nuance.
- Token counts are estimated (chars/4) for generation; actual prompt
  tokens are read back from the API usage field.
- P2 (speculation identity) requires toggling --spec-type on the server;
  left manual by design so the operator stays in the loop.
