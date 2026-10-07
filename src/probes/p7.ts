// P7: subagent delegation-chain probe (system-level, not model-level).
// A task is passed hop to hop; each hop sees ONLY the previous hop's
// output — exactly like Hermes delegate_task children, which know
// nothing of the parent conversation. Every hop must:
//   1. apply its own arithmetic step (composition across hops),
//   2. carry the secret CODE forward unchanged,
//   3. obey output constraints (exact format, forbidden words).
// Drift or loss at any hop = FAIL, graded by code on the FINAL answer.
//
// Variant B (fan-out): N workers run in parallel, each holding one
// fact; a merge hop must combine all of them. Tests llama-swap
// concurrent batch slots + fact survival across parallel fan-out.

import { rng, randomCode } from "../rng.js";

export type Op = { name: string; kind: "add" | "mul" | "sub"; arg: number };

export const ROLES = ["orchestrator", "coder", "tester", "reviewer", "debugger"] as const;
const FORBIDDEN = ["carefully", "ensure", "important"];

export type ChainCase = {
  id: string;
  hops: { role: string; op: Op }[];
  seedVal: number;
  expected: number;
  code: string;
  forbidden: string[];
  format: string;
};

function applyOp(op: Op, x: number): number {
  switch (op.kind) {
    case "add": return x + op.arg;
    case "mul": return x * op.arg;
    default: return x - op.arg;
  }
}

function opText(op: Op): string {
  const sym = op.kind === "add" ? "+" : op.kind === "mul" ? "*" : "-";
  return `def g${op.name}(x): return x ${sym} ${op.arg}`;
}

export function makeChainCase(seed: number, nHops: number): ChainCase {
  const r = rng(seed);
  const ops: Op[] = [];
  for (let i = 0; i < nHops; i++) {
    const kind = pickKind(r, i);
    const arg = kind === "mul" ? 2 + Math.floor(r() * 3) : 3 + Math.floor(r() * 40);
    ops.push({ name: String(i + 1), kind, arg });
  }
  const seedVal = 7 + Math.floor(r() * 90);
  let expected = seedVal;
  for (const op of ops) expected = applyOp(op, expected);
  const code = randomCode(r, 2, 4);
  return {
    id: `p7c-${seed}-${nHops}`,
    hops: ops.map((op, i) => ({ role: ROLES[i % ROLES.length], op })),
    seedVal,
    expected,
    code,
    forbidden: FORBIDDEN,
    format: "VALUE: <number>\nCODE: <code>\nNOTES: <one short line>",
  };
}

function pickKind(r: () => number, i: number): Op["kind"] {
  const kinds = ["add", "mul", "sub"] as const;
  return kinds[(i + Math.floor(r() * 3)) % 3];
}

// Prompt for hop 1 (sees the seed, the code, all constraints).
export function hop1Prompt(c: ChainCase): string {
  const op = c.hops[0].op;
  return (
    `You are the ${c.hops[0].role} agent in a pipeline. You must pass the task to the next agent.\n\n` +
    `TASK STATE: value = ${c.seedVal}. Secret CODE = ${c.code}.\n` +
    `CONSTRAINTS you must carry forward and obey in your output:\n` +
    `- The CODE must be reproduced exactly.\n` +
    `- Your NOTES line must NOT contain any of these words: ${c.forbidden.join(", ")}.\n\n` +
    `YOUR STEP: apply ${opText(op)} to the value.\n` +
    `Respond in EXACTLY this format (three lines, nothing else):\n${c.format}`
  );
}

// Prompt for hop k>1: input is ONLY the previous hop's output.
export function hopNPrompt(c: ChainCase, k: number, prevOutput: string): string {
  const op = c.hops[k].op;
  return (
    `You are the ${c.hops[k].role} agent in a pipeline. The previous agent handed you this:\n\n` +
    `---\n${prevOutput}\n---\n\n` +
    `Preserve the CODE and the constraints from the handoff exactly.\n` +
    `YOUR STEP: apply ${opText(op)} to the VALUE.\n` +
    `Respond in EXACTLY this format (three lines, nothing else):\n${c.format}`
  );
}

export type ChainGrade = {
  valueOk: boolean;
  codeOk: boolean;
  cleanNotes: boolean;
  formatOk: boolean;
  pass: boolean;
};

export function gradeChain(c: ChainCase, finalOutput: string): ChainGrade {
  const lines = finalOutput.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const vm = finalOutput.match(/VALUE:\s*(-?\d[\d,]*)/);
  const cm = finalOutput.match(/CODE:\s*(\S+)/);
  const valueOk = !!vm && Number(vm[1].replace(/,/g, "")) === c.expected;
  const codeOk = !!cm && cm[1] === c.code;
  const notes = lines.find((l) => l.startsWith("NOTES:")) ?? "";
  const cleanNotes = !c.forbidden.some((w) => notes.toLowerCase().includes(w));
  const formatOk = lines.length === 3 && lines[0].startsWith("VALUE:") && lines[1].startsWith("CODE:") && lines[2].startsWith("NOTES:");
  const pass = valueOk && codeOk && cleanNotes && formatOk;
  return { valueOk, codeOk, cleanNotes, formatOk, pass };
}

// --- Variant B: parallel fan-out + merge ---
export type Fact = { name: string; value: number };
export type FanCase = {
  id: string;
  nWorkers: number;
  facts: Fact[];
  expectedSum: number;
  code: string;
  workerPrompt: (f: Fact) => string;
  mergePrompt: (answers: string[]) => string;
};

export function makeFanCase(seed: number, nWorkers: number): FanCase {
  const r = rng(seed);
  const facts: Fact[] = [];
  for (let i = 0; i < nWorkers; i++) {
    facts.push({ name: `node_${String.fromCharCode(97 + i)}`, value: 10 + Math.floor(r() * 90) });
  }
  const expectedSum = facts.reduce((s, f) => s + f.value, 0);
  const code = randomCode(r, 2, 4);
  return {
    id: `p7f-${seed}-${nWorkers}`,
    nWorkers,
    facts,
    expectedSum,
    code,
    workerPrompt: (f) =>
      `You are a worker agent. You know exactly one fact: ${f.name} has load = ${f.value}.\n` +
      `Report it in EXACTLY this format (two lines, nothing else):\nFACT: ${f.name} = <number>\nCODE: ${code}`,
    mergePrompt: (answers) =>
      `You are the merge agent. ${answers.length} workers reported:\n\n` +
      answers.map((a, i) => `--- worker ${i + 1} ---\n${a}`).join("\n") +
      `\n\nTASK: sum the load of every FACT across all workers (every worker's fact must be included, no double counting).\n` +
      `Report the CODE exactly as given. Respond in EXACTLY this format (two lines, nothing else):\nSUM: <number>\nCODE: <code>`,
  };
}

export function gradeFan(c: FanCase, mergeOutput: string): ChainGrade {
  const sm = mergeOutput.match(/SUM:\s*(-?\d[\d,]*)/);
  const cm = mergeOutput.match(/CODE:\s*(\S+)/);
  const valueOk = !!sm && Number(sm[1].replace(/,/g, "")) === c.expectedSum;
  const codeOk = !!cm && cm[1] === c.code;
  const lines = mergeOutput.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const formatOk = lines.length === 2 && lines[0].startsWith("SUM:") && lines[1].startsWith("CODE:");
  return { valueOk, codeOk, cleanNotes: true, formatOk, pass: valueOk && codeOk && formatOk };
}
