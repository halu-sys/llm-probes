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
