// P8 runner. Usage: npx tsx src/run-p8.ts [profilesCsv] [tasksPerProfile] [--tool]
// Spawns `hermes -p <profile> -z <task> --usage-file <tmp>` per task —
// this exercises the REAL subagent stack (SOUL.md, toolsets, gateway
// accounting), not just the serving aliases.
// NOTE: runs strictly SEQUENTIALLY — the user forbids concurrent
// model-using jobs on this rig.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROFILES, makeAnswerTask, makeToolTask, gradeTask, type Task, type Usage,
} from "./probes/p8.js";

const args = process.argv.slice(2);
const withTool = args.includes("--tool");
const positional = args.filter((a: string) => !a.startsWith("--"));
const profiles = (positional[0] ?? "orchestrator,coder,tester").split(",");
const tasksPerProfile = Number(positional[1] ?? 1);

for (const p of profiles) {
  if (!(PROFILES as readonly string[]).includes(p)) {
    console.error(`unknown profile: ${p} (known: ${PROFILES.join(",")})`);
    process.exit(1);
  }
}

const workdir = mkdtempSync(join(tmpdir(), "p8-"));

type Row = {
  id: string; profile: string; kind: string; pass: boolean;
  completed: boolean; answerOk: boolean; formatOk: boolean; bounded: boolean; toolFileOk: boolean | null;
  apiCalls: number; inputTokens: number; outputTokens: number;
  turnExitReason: string; ms: number; reply: string;
};
const rows: Row[] = [];

function runHermes(profile: string, prompt: string, usagePath: string): { reply: string; usage: Usage; ms: number } {
  const t0 = Date.now();
  let reply = "";
  try {
    reply = execFileSync("hermes", ["-p", profile, "-z", prompt, "--usage-file", usagePath], {
      encoding: "utf8", timeout: 600_000, maxBuffer: 10 * 1024 * 1024,
    });
  } catch (e: any) {
    reply = String(e.stdout ?? "") + "\n" + String(e.message);
  }
  const ms = Date.now() - t0;
  let usage: Usage = { input_tokens: 0, output_tokens: 0, api_calls: 0, completed: false, failed: true, interrupted: false, turn_exit_reason: "no_usage_file", model: profile };
  if (existsSync(usagePath)) {
    const j = JSON.parse(readFileSync(usagePath, "utf8"));
    usage = {
      input_tokens: j.input_tokens, output_tokens: j.output_tokens, api_calls: j.api_calls,
      completed: j.completed, failed: j.failed, interrupted: j.interrupted,
      turn_exit_reason: j.turn_exit_reason, model: j.model,
    };
  }
  return { reply, usage, ms };
}

async function main() {
  let seed = 9000;
  for (const profile of profiles) {
    for (let i = 0; i < tasksPerProfile; i++) {
      const tasks: Task[] = [makeAnswerTask(seed++, profile, i)];
      if (withTool) tasks.push(makeToolTask(seed++, profile, i, workdir));
      for (const t of tasks) {
        const usagePath = join(workdir, `${t.id}-usage.json`);
        const { reply, usage, ms } = runHermes(profile, t.prompt, usagePath);
        const toolFileContent = t.toolFile && existsSync(t.toolFile) ? readFileSync(t.toolFile, "utf8") : null;
        const g = gradeTask(t, reply, usage, toolFileContent);
        rows.push({
          id: t.id, profile, kind: t.kind, pass: g.pass,
          completed: g.completed, answerOk: g.answerOk, formatOk: g.formatOk, bounded: g.bounded, toolFileOk: g.toolFileOk,
          apiCalls: usage.api_calls, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
          turnExitReason: usage.turn_exit_reason, ms, reply: reply.slice(0, 400),
        });
        console.log(`${t.id} ... ${g.pass ? "PASS" : "FAIL"} (done=${g.completed} ans=${g.answerOk} fmt=${g.formatOk} bound=${g.bounded}${g.toolFileOk === null ? "" : " file=" + g.toolFileOk}) ${usage.api_calls} calls, ${usage.input_tokens}+${usage.output_tokens} tok, ${Math.round(ms / 1000)}s`);
        // incremental save — never lose the sweep to an interrupt
        writeFileSync(`results/p8-${new Date().toISOString().slice(0, 10)}.partial.json`, JSON.stringify({ profiles, rows }, null, 2));
      }
    }
  }
  console.log(`\n=== P8 scoreboard ===`);
  for (const p of profiles) {
    const cell = rows.filter((r) => r.profile === p);
    const avgIn = Math.round(cell.reduce((s, r) => s + r.inputTokens, 0) / Math.max(1, cell.length));
    console.log(`${p.padEnd(14)} ${cell.filter((r) => r.pass).length}/${cell.length}  avg boot: ${avgIn} input tok/task`);
  }
  const out = `results/p8-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(out, JSON.stringify({ profiles, workdir, rows }, null, 2));
  console.log("saved:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
