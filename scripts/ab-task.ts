// Real-task A/B: same task prompt -> both models -> side-by-side files for
// YOU to judge. No LLM judge; your judgment is the grader.
// Usage: npx tsx scripts/ab-task.ts "<task text or @path/to/task.md>" [modelCsv]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { chat } from "../src/client.js";

const arg = process.argv[2];
if (!arg) { console.error("usage: ab-task.ts \"<task>\" or @task.md [modelCsv]"); process.exit(1); }
const task = arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
const models = (process.argv[3] ?? "flash,qwen27b").split(",");

async function main() {
  const ts = process.argv[4] ?? new Date().toISOString().replace(/[:.]/g, "-");
  for (const model of models) {
    const out = `results/ab-${ts}-${model}.md`;
    if (existsSync(out)) { console.log(`${model}: exists, skipping ${out}`); continue; }
    process.stdout.write(`${model} ... `);
    const r = await chat([{ role: "user", content: task }], { model, maxTokens: 16384, temperature: 0 });
    const empty = !r.text.trim();
    writeFileSync(out, `# ${model}\npromptTokens=${r.promptTokens} completion=${r.completionTokens} ms=${r.ms}\n\n## answer\n${r.text}\n`);
    if (r.reasoning.trim()) writeFileSync(`results/ab-${ts}-${model}-reasoning.md`, r.reasoning);
    console.log(`saved ${out}${empty ? "  *** WARNING: EMPTY ANSWER — reasoning exhausted the token budget ***" : ""}`);
  }
  console.log(`\ncompare: results/ab-${ts}-flash.md  vs  results/ab-${ts}-qwen27b.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
