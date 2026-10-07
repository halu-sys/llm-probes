// P8: Hermes agent-stack probe (the orchestrator layer, not the serving layer).
// P7 tested role ALIASES through llama-swap. P8 tests the actual Hermes
// subagent machinery: `hermes -p <profile> -z <task> --usage-file` —
// SOUL.md persona + toolset injection, one-shot completion, tool use,
// and the token accounting the gateway reports.
//
// Graded on four axes, all by code:
//   completed   — usage.completed true, exit 0
//   answerOk    — task answer matches expected (regex/exact)
//   formatOk    — required structural markers present in the reply
//   bounded     — api_calls <= cap (loop guard) AND input tokens <= cap
//
// The input-token axis is the headline metric: it is the per-subagent
// boot overhead (SOUL.md + tool schemas + memory) that no model-level
// probe can see.

import { rng, randomCode } from "../rng.js";

export const PROFILES = ["planner", "architect", "coder", "debugger", "tester", "reviewer", "refactorer", "researcher", "documentor", "prompter"] as const;
// orchestrator deliberately excluded: it is the PARENT role; probing it
// as a subagent tests a configuration the farm never runs.

export type Task = {
  id: string;
  profile: string;
  prompt: string;
  // grading
  expectPattern: RegExp;
  formatMarkers: string[];
  apiCallCap: number;
  inputTokenCap: number;
  kind: "answer" | "tool" | "multistep";
  // for tool tasks: file the agent must create, and expected content check
  toolFile?: string;
  toolContentPattern?: RegExp;
  toolFile2?: string;
  toolContent2Pattern?: RegExp;
  // multistep: minimum tool calls expected (too few = skipped steps/faking)
  minCalls?: number;
};

export function makeAnswerTask(seed: number, profile: string, idx: number): Task {
  const r = rng(seed);
  const a = 11 + Math.floor(r() * 80);
  const b = 11 + Math.floor(r() * 80);
  const mul = r() < 0.4;
  const expected = mul ? a * b : a + b;
  const code = randomCode(r, 2, 4);
  return {
    id: `p8a-${seed}-${profile}`,
    profile,
    prompt:
      `Compute ${mul ? `${a} * ${b}` : `${a} + ${b}`}. ` +
      `Reply in EXACTLY two lines and nothing else:\n` +
      `RESULT: <number>\nCODE: ${code}`,
    expectPattern: new RegExp(`RESULT:\\s*${expected}\\b`),
    formatMarkers: ["RESULT:", "CODE:", code],
    apiCallCap: 2,
    inputTokenCap: 20000,
    kind: "answer",
  };
}

export function makeToolTask(seed: number, profile: string, idx: number, workdir: string): Task {
  const r = rng(seed);
  const fname = `p8_${seed}_${idx}.txt`;
  const content = randomCode(r, 2, 4);
  return {
    id: `p8t-${seed}-${profile}`,
    profile,
    prompt:
      `Use a tool to write the exact text ${content} to the file ${workdir}/${fname}. ` +
      `Then reply with exactly one line: WROTE ${fname}`,
    expectPattern: new RegExp(`WROTE\\s+${fname}`),
    formatMarkers: [`WROTE ${fname}`],
    apiCallCap: 6,
    inputTokenCap: 40000,
    kind: "tool",
    toolFile: `${workdir}/${fname}`,
    toolContentPattern: new RegExp(content),
  };
}

// Multi-step long task: forces a sequence of dependent tool calls
// (create -> append N lines -> verify -> report computed result).
// Graded on final file state (exact line set), computed answer, and
// call-count window: too few calls = skipped steps (faking), too many
// = loop. This is the endurance/sequencing axis answer tasks can't see.
export function makeMultiStepTask(seed: number, profile: string, nSteps: number, workdir: string): Task {
  const r = rng(seed);
  const fname = `p8ms_${seed}.txt`;
  const path = `${workdir}/${fname}`;
  const vals: number[] = [];
  for (let i = 0; i < nSteps; i++) vals.push(10 + Math.floor(r() * 90));
  const sum = vals.reduce((s, v) => s + v, 0);
  return {
    id: `p8ms-${seed}-${profile}-${nSteps}`,
    profile,
    prompt:
      `Multi-step task. Do each step with a tool call, in order:\n` +
      `1. Write file ${path} containing the single line START\n` +
      vals.map((v, i) => `${i + 2}. Append one line to that file: step${i + 1} value ${v}`).join("\n") +
      `\n${nSteps + 2}. Read the file back and verify it has ${nSteps + 1} lines.\n` +
      `${nSteps + 3}. Reply with exactly two lines: FILE_OK <yes|no> and SUM: <sum of all step values>\n` +
      `Do not skip steps; do not write the file in one shot.`,
    expectPattern: new RegExp(`SUM:\\s*${sum}\\b`),
    formatMarkers: ["FILE_OK", `SUM: ${sum}`],
    apiCallCap: nSteps + 6,
    inputTokenCap: 60000,
    kind: "multistep",
    minCalls: nSteps,
    toolFile: path,
    toolContentPattern: new RegExp(
      `START\n` + vals.map((v, i) => `step${i + 1} value ${v}`).join("\n")
    ),
  };
}

// Production-hardening variant: longer chains + cross-file state.
// Steps alternate appends across TWO files; agent must read both back,
// verify line counts, and report per-file sums plus a grand total.
// Failure modes this exposes that the 6-step task cannot:
//   - state confusion between two files (wrong value in wrong file)
//   - arithmetic drift as step count grows (12-16 values to track)
//   - attention decay over a long numbered instruction list
export function makeChainTask(seed: number, profile: string, nSteps: number, workdir: string): Task {
  const r = rng(seed);
  const fa = `${workdir}/p8cA_${seed}.txt`;
  const fb = `${workdir}/p8cB_${seed}.txt`;
  const valsA: number[] = [];
  const valsB: number[] = [];
  const steps: string[] = [];
  steps.push(`1. Write file ${fa} containing the single line START`);
  steps.push(`2. Write file ${fb} containing the single line START`);
  for (let i = 0; i < nSteps; i++) {
    const v = 10 + Math.floor(r() * 90);
    const file = i % 2 === 0 ? fa : fb;
    (i % 2 === 0 ? valsA : valsB).push(v);
    steps.push(`${i + 3}. Append one line to ${file}: step${i + 1} value ${v}`);
  }
  const n = steps.length;
  const sumA = valsA.reduce((s, v) => s + v, 0);
  const sumB = valsB.reduce((s, v) => s + v, 0);
  return {
    id: `p8c-${seed}-${profile}-${nSteps}`,
    profile,
    prompt:
      `Multi-step task with TWO files. Do each step with a tool call, in order:\n` +
      steps.join("\n") +
      `\n${n + 1}. Read BOTH files back and verify each has ${1 + Math.ceil(nSteps / 2)} lines for A / ${1 + Math.floor(nSteps / 2)} lines for B.\n` +
      `${n + 2}. Reply with exactly three lines:\n` +
      `SUMA: <sum of A step values>\nSUMB: <sum of B step values>\nTOTAL: <grand total>\n` +
      `Do not skip steps; do not write either file in one shot.`,
    expectPattern: new RegExp(`SUMA:\\s*${sumA}[\\s\\S]*SUMB:\\s*${sumB}[\\s\\S]*TOTAL:\\s*${sumA + sumB}`),
    formatMarkers: ["SUMA:", "SUMB:", `TOTAL: ${sumA + sumB}`],
    apiCallCap: nSteps + 10,
    minCalls: nSteps + 2,
    inputTokenCap: 120000,
    kind: "multistep",
    toolFile: fa,
    toolContentPattern: new RegExp(
      `START\n` + valsA.map((v, i) => `step${2 * i + 1} value ${v}`).join("\n")
    ),
    // second-file check lives in the runner (grader takes one file)
    toolFile2: fb,
    toolContent2Pattern: new RegExp(
      `START\n` + valsB.map((v, i) => `step${2 * i + 2} value ${v}`).join("\n")
    ),
  };
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  api_calls: number;
  completed: boolean;
  failed: boolean;
  interrupted: boolean;
  turn_exit_reason: string;
  model: string;
};

export type Grade = {
  completed: boolean;
  answerOk: boolean;
  formatOk: boolean;
  bounded: boolean;
  processOk: boolean; // step-count window: deviates when batching legit work
  toolFileOk: boolean | null;
  pass: boolean;
};

// pass = artifact contract: completed + correct answer + format + files
// exact + no loop/token overflow. The step-count window (minCalls) is a
// PROCESS signal, reported separately: a subagent that batches appends
// but leaves exact files did the work efficiently, not dishonestly.
// A low call count with WRONG files is caught by toolFileOk anyway.
export function gradeTask(t: Task, reply: string, usage: Usage, toolFileContent: string | null, toolFile2Content: string | null = null): Grade {
  const completed = usage.completed && !usage.failed && !usage.interrupted;
  const answerOk = t.expectPattern.test(reply);
  const formatOk = t.formatMarkers.every((m) => reply.includes(m));
  const bounded = usage.api_calls <= t.apiCallCap && usage.input_tokens <= t.inputTokenCap;
  const processOk = t.minCalls === undefined || usage.api_calls >= t.minCalls;
  let toolFileOk: boolean | null = null;
  if (t.kind === "tool" || t.kind === "multistep") {
    toolFileOk = toolFileContent !== null && !!t.toolContentPattern && t.toolContentPattern.test(toolFileContent);
    if (toolFileOk && t.toolFile2) {
      toolFileOk = toolFile2Content !== null && !!t.toolContent2Pattern && t.toolContent2Pattern.test(toolFile2Content);
    }
  }
  const pass = completed && answerOk && formatOk && bounded && (toolFileOk !== false);
  return { completed, answerOk, formatOk, bounded, processOk, toolFileOk, pass };
}
