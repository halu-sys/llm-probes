// Offline re-grade of saved P3 results with the STRICT per-item grader.
// Zero model time: regenerates each case from the seed encoded in its id,
// then grades the stored answer text.
// Usage: npx tsx scripts/regrade-p3.ts
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { makeDecayCase, gradeDecayStrict } from "../src/probes/p3.js";

const files = readdirSync("results").filter((f) => f.startsWith("p3-") && f.endsWith(".json") && !f.includes("-strict"));
const summary: { file: string; model: string; lenient: number; strict: number; merged: number; total: number }[] = [];

for (const f of files) {
  const j = JSON.parse(readFileSync(`results/${f}`, "utf8"));
  let strict = 0, merged = 0, total = 0;
  const details: string[] = [];
  for (const r of j.rows) {
    const m = r.id.match(/^p3-(\d+)-(\d+)$/);
    if (!m) continue;
    const c = makeDecayCase(Number(m[1]), Number(m[2]));
    const g = gradeDecayStrict(c, r.answer);
    total++;
    if (g.pass) strict++;
    if (g.merged) merged++;
    details.push(`  ${r.id}: ${g.pass ? "exact" : g.merged ? "MERGED" : "FAIL"} (${g.detail})`);
  }
  const lenient = j.rows.filter((r: any) => r.pass).length;
  summary.push({ file: f, model: j.model, lenient, strict, merged, total });
  if (details.length) console.log(`${f} (${j.model}):\n${details.join("\n")}`);
  writeFileSync(`results/${f.replace(".json", "-strict.json")}`, JSON.stringify({ ...j, strict: true, rows: j.rows.map((r: any) => {
    const m = r.id.match(/^p3-(\d+)-(\d+)$/);
    if (!m) return r;
    const c = makeDecayCase(Number(m[1]), Number(m[2]));
    return { ...r, strict: gradeDecayStrict(c, r.answer) };
  }) }, null, 2));
}

console.log("model      lenient  strict  merged  total");
for (const s of summary) {
  console.log(`${s.model.padEnd(10)} ${String(s.lenient).padStart(6)}  ${String(s.strict).padStart(6)}  ${String(s.merged).padStart(6)}  ${s.total}`);
}
