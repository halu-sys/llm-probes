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
