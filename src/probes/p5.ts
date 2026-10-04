// P5: multi-hop chain across scattered context.
// Five tiny functions are embedded at five different depths inside a large
// filler document. The question asks for f5(f4(f3(f2(f1(seed))))).
// Unlike P1 (single-fact retrieval), this requires locating ALL five
// definitions AND composing them. Code-graded: the expected value is
// computed by the generator itself.

import { rng, pick } from "../rng.js";
import { fillerSentence, fillerTokensApprox } from "./p1.js";

type Op = { name: string; kind: "add" | "mul" | "sub"; arg: number };

function applyOp(op: Op, x: number): number {
  switch (op.kind) {
    case "add": return x + op.arg;
    case "mul": return x * op.arg;
    case "sub": return x - op.arg;
  }
}

function opText(op: Op): string {
  const sym = op.kind === "add" ? "+" : op.kind === "mul" ? "*" : "-";
  return `def ${op.name}(x): return x ${sym} ${op.arg}`;
}

export type ChainCase = {
  id: string;
  targetTokens: number;
  depths: number[];
  fullText: string;
  seed: number;
  expected: number;
  question: string;
};

// depths: where each function lands (0..1). Spread them far apart.
export function makeChainCase(seed: number, targetTokens: number, depths: number[]): ChainCase {
  const r = rng(seed);
  const names = ["f1", "f2", "f3", "f4", "f5"];
  const ops: Op[] = [];
  const used = new Set<string>();
  for (let i = 0; i < 5; i++) {
    let kind: Op["kind"];
    do {
      kind = pick(r, ["add", "mul", "sub"] as const);
    } while (used.has(kind) && used.size < 3);
    used.add(kind);
    const arg = kind === "mul" ? 2 + Math.floor(r() * 3) : 3 + Math.floor(r() * 40);
    ops.push({ name: names[i], kind, arg });
  }
  const seedVal = 7 + Math.floor(r() * 90);
  let expected = seedVal;
  for (const op of ops) expected = applyOp(op, expected);

  // Build the document: filler, inserting each function def at its depth.
  const needles = ops.map((op, i) => `NOTE ${i + 1}: ${opText(op)}`);
  const placed = depths.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
  const parts: string[] = [];
  let tokens = needles.reduce((s, n) => s + fillerTokensApprox(n), 0);
  const total = Math.max(500, targetTokens - tokens);
  for (const { d, i } of placed) {
    while (fillerTokensApprox(parts.join(" ")) < total * d) parts.push(fillerSentence(r));
    parts.push(needles[i]);
  }
  while (fillerTokensApprox(parts.join(" ")) < total) parts.push(fillerSentence(r));

  return {
    id: `p5-${seed}-${targetTokens}`,
    targetTokens,
    depths,
    fullText: parts.join(" "),
    seed: seedVal,
    expected,
    question:
      "Somewhere in the text above are five python one-liner function definitions named f1..f5, each appearing exactly once. " +
      `Compute f5(f4(f3(f2(f1(${seedVal}))))) using those definitions. Answer with ONLY the final number.`,
  };
}

export function gradeChain(expected: number, answer: string): boolean {
  const m = answer.match(/-?\d[\d,]*/g);
  if (!m) return false;
  const nums = m.map((s) => Number(s.replace(/,/g, "")));
  return nums.includes(expected);
}
