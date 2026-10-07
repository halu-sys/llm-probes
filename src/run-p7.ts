// P7 runner. Usage: npx tsx src/run-p7.ts [model] [hopsCsv] [seedsPerCell] [--fan]
// Variant A (default): delegation chain, sizes = hop counts (e.g. 2,3,5).
// Variant B (--fan): parallel fan-out, sizes = worker counts (e.g. 2,4 —
// llama-swap runs 2 batch slots concurrently, so 4 workers = 2 waves).
import { writeFileSync } from "node:fs";
import { chat } from "./client.js";
import {
  makeChainCase, hop1Prompt, hopNPrompt, gradeChain,
  makeFanCase, gradeFan,
} from "./probes/p7.js";

const args = process.argv.slice(2);
const fan = args.includes("--fan");
const positional = args.filter((a: string) => !a.startsWith("--"));
const model = positional[0] ?? "flash";
const sizesCsv = positional[1] ?? (fan ? "2,4" : "2,3,5");
const sizesList = sizesCsv.split(",").map(Number);
const seedsPerCell = Number(positional[2] ?? 1);

type Row = {
  id: string; size: number; pass: boolean;
  valueOk: boolean; codeOk: boolean; formatOk: boolean; cleanNotes: boolean;
  hops: number; promptTokens: number; completionTokens: number; ms: number;
  finalAnswer: string; expected: number | string;
  perHop: { role: string; ms: number; promptTokens: number; completionTokens: number }[];
};
const rows: Row[] = [];

async function runChain(seed: number, hops: number): Promise<Row> {
  const c = makeChainCase(seed, hops);
  const perHop: Row["perHop"] = [];
  let out = "";
  for (let k = 0; k < hops; k++) {
    const prompt = k === 0 ? hop1Prompt(c) : hopNPrompt(c, k, out);
    // route each hop by ROLE alias (llama-swap aliases -> same model,
    // per-alias sampling/reasoning_effort) — exercises per-profile routing
    const r = await chat([{ role: "user", content: prompt }], { model: c.hops[k].role, maxTokens: 8192, temperature: 0 });
    perHop.push({ role: c.hops[k].role, ms: r.ms, promptTokens: r.promptTokens, completionTokens: r.completionTokens });
    out = r.text;
  }
  const g = gradeChain(c, out);
  return {
    id: c.id, size: hops, pass: g.pass, valueOk: g.valueOk, codeOk: g.codeOk,
    formatOk: g.formatOk, cleanNotes: g.cleanNotes, hops,
    promptTokens: perHop.reduce((s, h) => s + h.promptTokens, 0),
    completionTokens: perHop.reduce((s, h) => s + h.completionTokens, 0),
    ms: perHop.reduce((s, h) => s + h.ms, 0),
    finalAnswer: out.slice(0, 300), expected: c.expected, perHop,
  };
}

async function runFan(seed: number, nWorkers: number): Promise<Row> {
  const c = makeFanCase(seed, nWorkers);
  const perHop: Row["perHop"] = [];
  const answers: string[] = [];
  // fire in waves of 2 (llama-swap batch slots / exclusive swap safety)
  for (let i = 0; i < c.facts.length; i += 2) {
    const wave = c.facts.slice(i, i + 2);
    const rs = await Promise.all(
      wave.map((f) => chat([{ role: "user", content: c.workerPrompt(f) }], { model, maxTokens: 4096, temperature: 0 })),
    );
    for (const r of rs) {
      answers.push(r.text);
      perHop.push({ role: "worker", ms: r.ms, promptTokens: r.promptTokens, completionTokens: r.completionTokens });
    }
  }
  const mr = await chat([{ role: "user", content: c.mergePrompt(answers) }], { model, maxTokens: 8192, temperature: 0 });
  perHop.push({ role: "merge", ms: mr.ms, promptTokens: mr.promptTokens, completionTokens: mr.completionTokens });
  const g = gradeFan(c, mr.text);
  return {
    id: c.id, size: nWorkers, pass: g.pass, valueOk: g.valueOk, codeOk: g.codeOk,
    formatOk: g.formatOk, cleanNotes: true, hops: nWorkers + 1,
    promptTokens: perHop.reduce((s, h) => s + h.promptTokens, 0),
    completionTokens: perHop.reduce((s, h) => s + h.completionTokens, 0),
    ms: perHop.reduce((s, h) => s + h.ms, 0),
    finalAnswer: mr.text.slice(0, 300), expected: c.expectedSum, perHop,
  };
}

async function main() {
  let seed = 7000;
  for (const size of sizesList) {
    for (let s = 0; s < seedsPerCell; s++) {
      const row = fan ? await runFan(seed++, size) : await runChain(seed++, size);
      rows.push(row);
      console.log(`${row.id} ... ${row.pass ? "PASS" : "FAIL"} (val=${row.valueOk} code=${row.codeOk} fmt=${row.formatOk} notes=${row.cleanNotes}) ${row.promptTokens}+${row.completionTokens} tok, ${Math.round(row.ms / 1000)}s`);
    }
  }
  console.log(`\n=== P7${fan ? " fan-out" : " chain"} scoreboard (model=${model}) ===`);
  for (const size of sizesList) {
    const cell = rows.filter((r) => r.size === size);
    console.log(`${size} ${fan ? "workers" : "hops"}  ${cell.filter((r) => r.pass).length}/${cell.length}`);
  }
  const out = `results/p7${fan ? "fan" : "chain"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ model, rows }, null, 2));
  console.log("saved:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
