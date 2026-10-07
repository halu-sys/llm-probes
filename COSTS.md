# Cost & throughput ledger

Point-in-time measurements from the production farm (2026-10).
Self-hosted: zero marginal token cost; the numbers below are what the
hardware buys, and what the API equivalent would have cost.

## Hardware

- RTX 3090 (24 GB) + RTX 4070 Ti Super (16 GB), tensor-split 3,5
- 64 GB system RAM (KV parking + expert page-cache)
- Inference: Strata (MoE GGUF fork of llama.cpp) behind llama-swap :1236
- Model: Qwen3.8-Flash-Next-GSQ-RCO-IQ3_S, 262k ctx, MTP spec decode

## Throughput (measured, live stack)

| metric | value | how measured |
|---|---|---|
| warm decode | ~81 tok/s | farm HUD, sustained sessions |
| probe decode (P8 multistep) | ~1.0-1.2K tok/s aggregate incl. prompt eval | usage.completion_tokens / wall |
| prompt eval | ~175 tok/s (301-tok probe: 1.7s) | server timings block |
| model load (cold) | 1-3 min | llama-swap startupHealthCheck |
| concurrent serving | 2 batch slots (parallel requests OK) | P7 fan-out waves of 2 |

## Tuning wins (measured on this rig)

| change | effect |
|---|---|
| `--tensor-split 3,5` across 3090+4070TiS | fits 262k-ctx IQ3_S across mixed VRAM; single-GPU impossible |
| `--ubatch 64` (not 512) | stable on this MoE; 512 regressed |
| MTP spec decode (draft-mtp, n-max 2) | 8/10 byte-identical vs no-spec (P2); accepted-draft ~83% on short tasks (draft_n 42 / accepted 35 measured) |
| `--mmap-experts` (page-cache experts, not pinned arena) | 193K+ ctx with 48 GB free RAM; warm decode unchanged at ~81 tok/s |
| `--kv-resident 32768` | hot-prefix KV stays resident; full --kv-resident crashes (RAM-starved, reverted) |
| conversation parking (2 slots, 4096 MiB, min-free 512) | long sessions survive eviction; snapshots solid at 196608 ctx |
| Strata prompt caching | repeat subagent boot payload: 13.7K -> ~1.2-3K input tok on cache hit (P8) |

## The agent-stack cost structure (P8, measured)

Per fresh subagent (one-shot `hermes -p <profile> -z`):

| component | tokens |
|---|---|
| boot payload (SOUL.md + tool schemas + memory), cold | ~13.6-13.9K input |
| boot payload, prompt-cached (same profile, sequential) | ~1.2-3K input |
| trivial answer output | 18-60 output |
| 6-step tool task | ~1-1.4K input (cached) + 150-1.3K output |
| 12-step two-file task | 2-4K input + 0.8-2.4K output, 5-16 tool calls, 22-108s |

Implications (all measured, not estimated):
- Fan-out budget: N children x 13.7K boot tokens BEFORE task content.
  5 children = ~70K tokens of pure overhead per fan-out.
- Sequential same-profile runs are nearly free on boot (cache hits);
  cross-profile fan-out pays full payload per child.
- Persona files are cost-bearing assets: every KB in SOUL.md is paid
  by every delegation to that profile.
- Batcher profiles (5-10 calls vs 15-16 for steppers, P8 chain-12)
  cut round-trips 2-3x at similar wall time — same artifact quality.

## API-equivalent comparison

The work in results/ (P1-P8 sweeps: ~150+ agent runs, several
multi-hundred-K-token prefills) would have cost, at 2026 mid-tier API
pricing (~$3/M input, ~$15/M output, conservative):

- P1-P6 long-context sweeps: prefills alone exceed 10M input tokens
  across runs -> ~$30+ per full sweep pass, re-runs never free
- P7+P8 agent probes: ~500K tokens -> ~$2-4
- Daily-driver use of the same stack (this session included): $0
  marginal, no rate limits, no data egress

The farm's real cost is electricity + hardware amortization; a full
262k-prefill sweep costs a few minutes of GPU time, not dollars. The
enabling constraint was never budget — it was the serving-layer work
above. An API-only operator cannot run a 250k-token probe sweep
repeatedly; this operator did, and the failure modes it found
(empty-answer budget traps, stripParams, label drift) are exactly the
ones that hide behind an API.
