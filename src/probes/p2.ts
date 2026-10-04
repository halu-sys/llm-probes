// P2: speculative-decoding identity.
// Same fixed prompts, temperature 0, run twice: with and without --spec-type.
// llama.cpp guarantees speculation is lossless: outputs must be byte-identical.
// Any divergence = bug in the spec path (or nondeterminism elsewhere).

export interface P2Case {
  id: string;
  prompt: string;
  maxTokens: number;
}

// Fixed, diverse prompts — no RNG, byte-stable across runs.
export const P2_CASES: P2Case[] = [
  { id: "arith", prompt: "What is 17*23+41? Answer with just the number.", maxTokens: 64 },
  { id: "list", prompt: "List the first 12 prime numbers, comma separated.", maxTokens: 128 },
  { id: "code", prompt: "Write a Python function fib(n) returning the nth Fibonacci number. Code only.", maxTokens: 256 },
  { id: "translate", prompt: "Translate to Tagalog: 'The server crashed because the memory ran out.' Output only the translation.", maxTokens: 128 },
  { id: "explain", prompt: "Explain in two sentences what a KV cache is in transformer inference.", maxTokens: 192 },
  { id: "json", prompt: 'Output JSON only: {"planets": [all planets in the solar system in order from the sun]}', maxTokens: 192 },
  { id: "poem", prompt: "Write a four-line poem about GPUs. No title, no preamble.", maxTokens: 256 },
  { id: "steps", prompt: "How many steps to take from 7 to 100 by adding 3 each time? Show the count only.", maxTokens: 96 },
  { id: "facts", prompt: "Name the three chemical elements that are liquid at room temperature and pressure. Comma separated.", maxTokens: 96 },
  { id: "logic", prompt: "If all bloops are razzies and all razzies are lazzies, are all bloops definitely lazzies? Answer yes or no with one sentence of reasoning.", maxTokens: 128 },
];

export interface P2Row {
  id: string;
  text: string;
  finish: string;
  completionTokens: number;
}

export function compareP2(a: P2Row[], b: P2Row[]): { id: string; identical: boolean; firstDiffAt: number; aLen: number; bLen: number }[] {
  const byId = new Map(a.map((r) => [r.id, r]));
  return b.map((r) => {
    const o = byId.get(r.id);
    if (!o) return { id: r.id, identical: false, firstDiffAt: -1, aLen: 0, bLen: r.text.length };
    let i = 0;
    while (i < o.text.length && i < r.text.length && o.text[i] === r.text[i]) i++;
    return {
      id: r.id,
      identical: o.text === r.text,
      firstDiffAt: i,
      aLen: o.text.length,
      bLen: r.text.length,
    };
  });
}
