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
