// P2 runner. Two phases:
//   npx tsx src/run-p2.ts qwen27b mtp-on            -> saves baseline
//   npx tsx src/run-p2.ts qwen27b mtp-off           -> compares vs latest baseline
import { writeFileSync } from "node:fs";
import { chat } from "./client.js";
import { P2_CASES, compareP2, type P2Row } from "./probes/p2.js";

const model = process.argv[2] ?? "qwen27b";
const tag = process.argv[3] ?? "run";
const baseUrl = process.argv[4]; // optional: point at another llama-swap port
const baselineFile = process.argv[5]; // optional: explicit baseline to compare

async function main() {
  const rows: P2Row[] = [];
  for (const c of P2_CASES) {
    const r = await chat([{ role: "user", content: c.prompt }], {
      model,
      maxTokens: c.maxTokens,
      temperature: 0,
      ...(baseUrl ? { baseUrl } : {}),
    });
    // include reasoning bytes too — speculation affects the whole decode
    const full = (r.reasoning ?? "") + "\u0000" + (r.text ?? "");
    rows.push({ id: c.id, text: full, finish: r.finish, completionTokens: r.completionTokens });
    console.log(`${c.id} ... ${r.completionTokens} tok, finish=${r.finish}`);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const out = `results/p2-${tag}-${ts}.json`;
  writeFileSync(out, JSON.stringify({ model, tag, rows }, null, 2));
  console.log("saved:", out);

  // if a baseline of the other tag exists, compare
  const { readdirSync, readFileSync } = await import("node:fs");
  let baseName: string | undefined = baselineFile;
  if (!baseName) {
    const others = readdirSync("results")
      .filter((f) => f.startsWith("p2-") && !f.includes(`-${tag}-`) && f !== out.split("/").pop())
      .sort();
    if (others.length === 0) {
      console.log("no baseline yet — run the other config to compare");
      return;
    }
    baseName = others[others.length - 1];
  }
  const base = JSON.parse(readFileSync(`results/${baseName}`, "utf8"));
  const cmp = compareP2(base.rows, rows);
  const same = cmp.filter((c) => c.identical).length;
  console.log(`\n=== P2 verdict: ${same}/${cmp.length} byte-identical vs ${baseName} ===`);
  for (const c of cmp) {
    if (!c.identical) console.log(`  DIVERGE ${c.id}: first diff at char ${c.firstDiffAt} (len ${c.aLen} vs ${c.bLen})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
