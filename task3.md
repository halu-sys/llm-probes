# Task: refactor the llm-probes runners (REAL code included)

Below is the ACTUAL source of all five runners plus the shared chat client.

Refactor to extract a shared runner (src/runner.ts) that all five use,
WITHOUT changing any probe's grading logic and WITHOUT changing the
results file format: results/*.json must stay byte-compatible for the
offline regrade script (scripts/regrade-p3.ts reads rows[].id and
rows[].answer; P2 comparison reads rows[].text).

Deliver:
1. The exact shape of the shared runner (function signature + what varies per probe).
2. Every file that must change and what changes in it.
3. The order of changes so the 35 vitest tests stay green at every step.
4. The 2 riskiest spots where byte-compatibility could silently break,
   and how the existing tests/scripts would (or would NOT) catch each.

Constraints: TypeScript ESM, no new dependencies, CLI usage identical
(npx tsx src/run-pN.ts model sizesCsv ...).

### src/run-p1.ts
```ts
// P1 runner: needle-in-haystack sweep.
// Usage: npx tsx src/run-p1.ts [model] [sizesCsv] [depthsCsv] [seedsPerCell] [startSeed]
// e.g.  npx tsx src/run-p1.ts flash 8000,32000 5,50,95 1
import { mkdirSync, writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { makeNeedleCase, gradeNeedle } from "./probes/p1.js";

const model = process.argv[2] ?? "flash";
const sizes = (process.argv[3] ?? "8000").split(",").map(Number);
const depths = (process.argv[4] ?? "5,50,95").split(",").map((d) => Number(d) / 100);
const seedsPerCell = Number(process.argv[5] ?? 1);

type Row = { id: string; size: number; depth: number; pass: boolean; promptTokens: number; ms: number; answer: string };
const rows: Row[] = [];

async function main() {
let seedCounter = Number(process.argv[6] ?? 1000);
for (const size of sizes) {
  for (const depth of depths) {
    for (let s = 0; s < seedsPerCell; s++) {
      const c = makeNeedleCase(seedCounter++, size, depth);
      process.stdout.write(`${c.id} ... `);
      try {
        const r = await chat(
          [
            { role: "system", content: "You are a careful reading assistant. Answer exactly as instructed." },
            { role: "user", content: `Read the following document carefully, then answer the question.\n\n--- DOCUMENT ---\n${c.fullText}\n--- END DOCUMENT ---\n\n${c.question}` },
          ],
          { model, maxTokens: 256, temperature: 0 },
        );
        const pass = gradeNeedle(c.code, r.text);
        rows.push({ id: c.id, size, depth, pass, promptTokens: r.promptTokens, ms: r.ms, answer: r.text.slice(0, 120) });
        console.log(`${pass ? "PASS" : "FAIL"} (${r.promptTokens} tok in, ${r.ms} ms) ans="${r.text.trim().slice(0, 40)}"`);
      } catch (e: any) {
        rows.push({ id: c.id, size, depth, pass: false, promptTokens: 0, ms: 0, answer: `ERROR: ${e.message}` });
        console.log(`ERROR: ${e.message}`);
      }
    }
  }
}

mkdirSync("results", { recursive: true });
const out = `p1-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(`results/${out}`, JSON.stringify({ model, rows }, null, 2));

// scoreboard
console.log(`\n=== P1 scoreboard (model=${model}) ===`);
for (const size of sizes) {
  const byDepth = new Map<number, { pass: number; total: number }>();
  for (const r of rows.filter((r) => r.size === size)) {
    const b = byDepth.get(r.depth) ?? { pass: 0, total: 0 };
    b.total++; if (r.pass) b.pass++;
    byDepth.set(r.depth, b);
  }
  const cells = depths.map((d) => {
    const b = byDepth.get(d) ?? { pass: 0, total: 0 };
    return `${Math.round(d * 100)}%:${b.pass}/${b.total}`;
  });
  console.log(`${String(size).padStart(6)} tok  ${cells.join("  ")}`);
}
console.log(`saved: results/${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

```

### src/run-p3.ts
```ts
// P3 runner: instruction decay sweep.
// Usage: node/tsx src/run-p3.ts [model] [sizesCsv] [seedsPerCell]
import { mkdirSync, writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { makeDecayCase, gradeDecay, gradeDecayStrict } from "./probes/p3.js";

async function main() {
  const model = process.argv[2] ?? "flash";
  const sizes = (process.argv[3] ?? "8000").split(",").map(Number);
  const seedsPerCell = Number(process.argv[4] ?? 1);
  type Row = { id: string; size: number; pass: boolean; promptTokens: number; ms: number; answer: string };
  const rows: Row[] = [];
  let seed = 2000;
  for (const size of sizes) {
    for (let s = 0; s < seedsPerCell; s++) {
      const c = makeDecayCase(seed++, size);
      process.stdout.write(`${c.id} ... `);
      try {
        const r = await chat(
          [{ role: "user", content: `${c.fullText}\n\n${c.question}` }],
          { model, maxTokens: 8192, temperature: 0 },
        );
        const pass = gradeDecay(c, r.text);
        const strict = gradeDecayStrict(c, r.text);
        rows.push({ id: c.id, size, pass, strict: strict.pass, merged: strict.merged, promptTokens: r.promptTokens, ms: r.ms, answer: r.text.slice(0, 200) });
        console.log(`${pass ? "PASS" : "FAIL"}${strict.pass ? "/strict" : strict.merged ? "/MERGED" : "/strictFAIL"} (${r.promptTokens} tok, ${r.ms} ms) ans="${r.text.trim().slice(0, 60)}"`);
      } catch (e: any) {
        rows.push({ id: c.id, size, pass: false, promptTokens: 0, ms: 0, answer: `ERROR: ${e.message}` });
        console.log(`ERROR: ${e.message}`);
      }
    }
  }
  mkdirSync("results", { recursive: true });
  const out = `p3-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(`results/${out}`, JSON.stringify({ model, rows }, null, 2));
  console.log(`\n=== P3 scoreboard (model=${model}) ===`);
  for (const size of sizes) {
    const cell = rows.filter((r) => r.size === size);
    console.log(`${String(size).padStart(6)} tok  ${cell.filter((r) => r.pass).length}/${cell.length}`);
  }
  console.log(`saved: results/${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

```

### src/run-p4.ts
```ts
// P4 runner: degeneration/loop statistics over N generations.
// Usage: node/tsx src/run-p4.ts [model] [N]
import { mkdirSync, writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { repetitionRate, detectLoop } from "./probes/p4.js";
import { rng } from "./rng.js";

const PROMPTS = [
  "List 15 breeds of dog, one per line.",
  "Write a short paragraph about the water cycle.",
  "Name 10 capital cities in Europe, one per line.",
  "Explain what a database index is in 3 sentences.",
  "List 12 fruits, one per line.",
];

async function main() {
  const model = process.argv[2] ?? "flash";
  const N = Number(process.argv[3] ?? 20);
  const r = rng(77);
  const rows: { i: number; prompt: string; rep: number; loop: boolean; ms: number; tokens: number }[] = [];
  for (let i = 0; i < N; i++) {
    const p = PROMPTS[Math.floor(r() * PROMPTS.length)];
    process.stdout.write(`p4-${i} ... `);
    try {
      const res = await chat([{ role: "user", content: p }], { model, maxTokens: 400, temperature: 0.7 });
      const rep = repetitionRate(res.text);
      const loop = detectLoop(res.text);
      rows.push({ i, prompt: p, rep, loop, ms: res.ms, tokens: res.completionTokens });
      console.log(`rep=${(rep * 100).toFixed(1)}% loop=${loop} (${res.completionTokens} tok, ${res.ms} ms)`);
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
    }
  }
  mkdirSync("results", { recursive: true });
  const out = `p4-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(`results/${out}`, JSON.stringify({ model, rows }, null, 2));
  const loops = rows.filter((x) => x.loop).length;
  const highRep = rows.filter((x) => x.rep > 0.3).length;
  const meanRep = rows.reduce((a, b) => a + b.rep, 0) / (rows.length || 1);
  console.log(`\n=== P4 scoreboard (model=${model}, n=${rows.length}) ===`);
  console.log(`loops: ${loops}/${rows.length}   high-rep(>30%): ${highRep}/${rows.length}   mean rep: ${(meanRep * 100).toFixed(1)}%`);
  console.log(`saved: results/${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

```

### src/run-p5.ts
```ts
// P5 runner. Usage: npx tsx src/run-p5.ts [model] [sizesCsv] [seedsPerCell]
// Depths are fixed spread: 2/25/50/75/98%.
import { writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { makeChainCase, gradeChain } from "./probes/p5.js";

const model = process.argv[2] ?? "flash";
const sizes = (process.argv[3] ?? "8000,32000,128000").split(",").map(Number);
const seedsPerCell = Number(process.argv[4] ?? 1);
const DEPTHS = [0.02, 0.25, 0.5, 0.75, 0.98];

type Row = { id: string; size: number; pass: boolean; promptTokens: number; ms: number; answer: string; expected: number };
const rows: Row[] = [];

async function main() {
  let seed = 5000;
  for (const size of sizes) {
    for (let s = 0; s < seedsPerCell; s++) {
      const c = makeChainCase(seed++, size, DEPTHS);
      const r = await chat([{ role: "user", content: `${c.fullText}\n\n${c.question}` }], {
        model,
        maxTokens: 8192,
        temperature: 0,
      });
      const pass = gradeChain(c.expected, r.text);
      rows.push({ id: c.id, size, pass, promptTokens: r.promptTokens, ms: r.ms, answer: r.text.slice(0, 200), expected: c.expected });
      console.log(`${c.id} ... ${pass ? "PASS" : "FAIL"} (${r.promptTokens} tok, ${r.ms} ms) exp=${c.expected} ans=${JSON.stringify(r.text.slice(0, 80))}`);
    }
  }
  console.log(`\n=== P5 scoreboard (model=${model}) ===`);
  for (const size of sizes) {
    const cell = rows.filter((r) => r.size === size);
    console.log(`${size} tok  ${cell.filter((r) => r.pass).length}/${cell.length}`);
  }
  const out = `results/p5-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ model, rows }, null, 2));
  console.log("saved:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

```

### src/run-p6.ts
```ts
// P6 runner. Usage: npx tsx src/run-p6.ts [model] [sizesCsv] [nCallers] [seedsPerCell]
import { writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { makeCodeCase, gradeCode } from "./probes/p6.js";

const model = process.argv[2] ?? "flash";
const sizes = (process.argv[3] ?? "8000,32000,128000").split(",").map(Number);
const nCallers = Number(process.argv[4] ?? 6);
const seedsPerCell = Number(process.argv[5] ?? 1);
const DEPTHS = [0.05, 0.2, 0.4, 0.6, 0.8, 0.95].slice(0, nCallers);

type Row = { id: string; size: number; pass: boolean; missing: string[]; extra: string[]; promptTokens: number; ms: number; answer: string };
const rows: Row[] = [];

async function main() {
  let seed = 7000;
  for (const size of sizes) {
    for (let s = 0; s < seedsPerCell; s++) {
      const c = makeCodeCase(seed++, size, nCallers, DEPTHS);
      let r;
      try {
        r = await chat([{ role: "user", content: `${c.fullText}\n\n${c.question}` }], {
          model,
          maxTokens: 8192, // qwen27b reasoning can exceed 4k; empty answers below that
          temperature: 0,
        });
      } catch (e: any) {
        rows.push({ id: c.id, size, pass: false, missing: c.callers, extra: [], promptTokens: 0, ms: 0, answer: `ERROR: ${e.message}` });
        console.log(`${c.id} ... ERROR ${e.message.slice(0, 150)}`);
        continue;
      }
      const g = gradeCode(c, r.text);
      rows.push({ id: c.id, size, pass: g.pass, missing: g.missing, extra: g.extra, promptTokens: r.promptTokens, ms: r.ms, answer: r.text.slice(0, 300) });
      console.log(`${c.id} ... ${g.pass ? "PASS" : "FAIL"} (${r.promptTokens} tok, ${r.ms} ms) missing=[${g.missing}] extra=[${g.extra}]`);
    }
  }
  console.log(`\n=== P6 scoreboard (model=${model}, ${nCallers} callers) ===`);
  for (const size of sizes) {
    const cell = rows.filter((r) => r.size === size);
    console.log(`${size} tok  ${cell.filter((r) => r.pass).length}/${cell.length}`);
  }
  const out = `results/p6-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ model, nCallers, rows }, null, 2));
  console.log("saved:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

```

### src/client.ts
```ts
// Minimal OpenAI-compatible client for llama-swap (:1236).
export type ChatOpts = {
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export async function chat(
  messages: { role: string; content: string }[],
  opts: ChatOpts,
): Promise<{ text: string; reasoning: string; finish: string; promptTokens: number; completionTokens: number; ms: number }> {
  const base = opts.baseUrl ?? "http://localhost:1236/v1";
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000),
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens ?? 64,
      temperature: opts.temperature ?? 0,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as any;
  const ms = Date.now() - t0;
  return {
    text: j.choices?.[0]?.message?.content ?? "",
    reasoning: j.choices?.[0]?.message?.reasoning_content ?? "",
    finish: j.choices?.[0]?.finish_reason ?? "",
    promptTokens: j.usage?.prompt_tokens ?? 0,
    completionTokens: j.usage?.completion_tokens ?? 0,
    ms,
  };
}

```