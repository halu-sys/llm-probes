// P3 runner: instruction decay sweep.
// Usage: node/tsx src/run-p3.ts [model] [sizesCsv] [seedsPerCell]
import { mkdirSync, writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { makeDecayCase, gradeDecay } from "./probes/p3.js";

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
        rows.push({ id: c.id, size, pass, promptTokens: r.promptTokens, ms: r.ms, answer: r.text.slice(0, 200) });
        console.log(`${pass ? "PASS" : "FAIL"} (${r.promptTokens} tok, ${r.ms} ms) ans="${r.text.trim().slice(0, 60)}"`);
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
