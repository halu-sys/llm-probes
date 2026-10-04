// P6: deep code comprehension across a large synthetic codebase.
// A seeded generator builds many Python-style files (unique function names,
// no training-data contamination). One "core" function is defined once;
// N caller functions are scattered across files at spread depths.
// Question: list ALL callers of the core function. Graded by exact set
// match AND false-positive check against every defined name in the doc.

import { rng } from "../rng.js";

// Code filler is denser than prose: measured 3.89 chars/token on this tokenizer.
function codeTokensApprox(s: string): number {
  return Math.ceil(s.length / 3.85);
}

const ADJ = ["async", "cached", "batched", "signed", "rotating", "pooled", "throttled", "versioned", "encrypted", "incremental", "deferred", "idempotent", "sharded", "streamed", "quota", "ledger", "manifest", "handshake", "checkpoint", "watermark"];
const NOUN = ["fetch", "audit", "reconcile", "dispatch", "validate", "compact", "hydrate", "prune", "mirror", "settle", "encode", "route", "archive", "index", "flush", "merge", "probe", "rotate", "scan", "commit"];

type Fn = { name: string; file: string };

function uniqueName(used: Set<string>, r: () => number): string {
  const base = `${ADJ[Math.floor(r() * ADJ.length)]}_${NOUN[Math.floor(r() * NOUN.length)]}`;
  if (!used.has(base)) { used.add(base); return base; }
  for (let n = 1; ; n++) {
    const withNum = `${base}_${n}`;
    if (!used.has(withNum)) { used.add(withNum); return withNum; }
  }
}

function fileBody(fnNames: string[], core: string | null, r: () => number): string {
  const lines: string[] = [];
  for (const fn of fnNames) {
    const arg = ["ctx", "record", "state", "payload", "cursor"][Math.floor(r() * 5)];
    lines.push(`def ${fn}(${arg}):`);
    lines.push(`    """${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]} pass over ${arg}."""`);
    if (core) lines.push(`    result = ${core}(${arg})`);
    lines.push(`    return ${core ? "result" : arg}`);
    lines.push("");
  }
  return lines.join("\n");
}

export type CodeCase = {
  id: string;
  targetTokens: number;
  core: string;
  callers: string[];      // expected answer set
  definedNames: string[]; // every defined function (for false-positive check)
  fullText: string;
  question: string;
};

export function makeCodeCase(seed: number, targetTokens: number, nCallers: number, depths: number[]): CodeCase {
  const r = rng(seed);
  const used = new Set<string>();
  const core = uniqueName(used, r);

  // caller files at spread depths
  const callers: Fn[] = [];
  for (let i = 0; i < nCallers; i++) {
    callers.push({ name: uniqueName(used, r), file: `svc_${String(i + 1).padStart(2, "0")}.py` });
  }

  const parts: string[] = [];
  const placed = depths.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d);
  const callerText = placed.map(({ i }) => {
    const c = callers[i];
    return `# ---- file: ${c.file} ----\n${fileBody([c.name], core, r)}`;
  });
  let callerTokens = callerText.reduce((s, t) => s + codeTokensApprox(t), 0);
  const coreFile = `# ---- file: core_${core}.py ----\n${fileBody([core], null, r)}`;
  const total = Math.max(2000, targetTokens - callerTokens - codeTokensApprox(coreFile));

  // core file near the top (2%)
  parts.push(coreFile);
  for (let k = 0; k < placed.length; k++) {
    const d = placed[k].d;
    while (codeTokensApprox(parts.join("\n\n")) < total * d) {
      const fns = Array.from({ length: 2 + Math.floor(r() * 4) }, () => uniqueName(used, r));
      parts.push(`# ---- file: mod_${uniqueName(used, r)}.py ----\n${fileBody(fns, null, r)}`);
    }
    parts.push(callerText[k]);
  }
  while (codeTokensApprox(parts.join("\n\n")) < total) {
    const fns = Array.from({ length: 2 + Math.floor(r() * 4) }, () => uniqueName(used, r));
    parts.push(`# ---- file: mod_${uniqueName(used, r)}.py ----\n${fileBody(fns, null, r)}`);
  }

  const fullText = parts.join("\n\n");
  return {
    id: `p6-${seed}-${targetTokens}`,
    targetTokens,
    core,
    callers: callers.map((c) => c.name),
    definedNames: [...used],
    fullText,
    question:
      `In the codebase above, the function \`${core}\` is defined in core_${core}.py. ` +
      `List EVERY function that calls \`${core}\`. Answer with ONLY a comma-separated list of function names, nothing else.`,
  };
}

export function gradeCode(c: CodeCase, answer: string): { pass: boolean; missing: string[]; extra: string[] } {
  const found = new Set<string>();
  for (const name of c.definedNames) {
    // name appears in the answer as a whole word
    if (new RegExp(`\\b${name}\\b`).test(answer)) found.add(name);
  }
  const missing = c.callers.filter((n) => !found.has(n));
  const extra = [...found].filter((n) => !c.callers.includes(n));
  return { pass: missing.length === 0 && extra.length === 0, missing, extra };
}
