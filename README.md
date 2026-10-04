# llm-probes

Deployment-specific eval probes for a local llama.cpp/llama-swap stack.
NOT another lm-eval-harness — see docs/SPEC.md for why.

Answers questions only THIS machine can answer:
- Is 262k context real at IQ3_S quantization? (P1)
- Does format-following survive long context? (P3)
- What is the actual loop/degeneration rate? (P4)
- Does MTP speculation change outputs? (P2, needs server restart — manual)

All probes are procedurally generated at runtime (seeded, reproducible,
no training-data contamination) and graded by CODE (exact match, JSON
schema, statistics) — never by another LLM.

## Usage

```
npx vitest run                                  # unit tests (graders/generators)
./node_modules/.bin/tsx src/run-p1.ts flash 8000,32000,128000,256000 5,50,95 1
./node_modules/.bin/tsx src/run-p3.ts flash 8000,32000,128000,256000 1
./node_modules/.bin/tsx src/run-p4.ts flash 20
```

Results land in `results/*.json` + a terminal scoreboard.

## Results so far (flash = Qwen3.6-27B IQ3_S, 262k ctx, MTP spec, llama-swap :1236)

| probe | result |
|---|---|
| P1 needle, 8k–256k × depths 5/50/95% | **12/12 PASS** (n=1/cell) |
| P4 degeneration, n=20 | 0 loops, 0 high-rep, mean rep 0.0% |
| P3 decay | see results/ |

Caveats: n=1 per cell is a smoke test, not statistics. Rerun with more
seeds for confidence. P1 filler is prose-like; adversarial fillers
(repetitive code, tables) stress KV cache differently.

## Honest limits

- Measures retrieval + format-following + degeneration. Does NOT measure
  truthfulness of long-form prose, creativity, or nuance.
- Token counts are estimated (chars/4) for generation; actual prompt
  tokens are read back from the API usage field.
- P2 (speculation identity) requires toggling --spec-type on the server;
  left manual by design so the operator stays in the loop.
