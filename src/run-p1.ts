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
