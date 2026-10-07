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

export const PROFILES = ["orchestrator", "planner", "architect", "coder", "debugger", "tester", "reviewer", "refactorer", "researcher", "documentor", "prompter"] as const;

export type Task = {
  id: string;
  profile: string;
  prompt: string;
  // grading
  expectPattern: RegExp;
  formatMarkers: string[];
  apiCallCap: number;
  inputTokenCap: number;
  kind: "answer" | "tool";
  // for tool tasks: file the agent must create, and expected content check
  toolFile?: string;
  toolContentPattern?: RegExp;
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
  toolFileOk: boolean | null;
  pass: boolean;
};

export function gradeTask(t: Task, reply: string, usage: Usage, toolFileContent: string | null): Grade {
  const completed = usage.completed && !usage.failed && !usage.interrupted;
  const answerOk = t.expectPattern.test(reply);
  const formatOk = t.formatMarkers.every((m) => reply.includes(m));
  const bounded = usage.api_calls <= t.apiCallCap && usage.input_tokens <= t.inputTokenCap;
  let toolFileOk: boolean | null = null;
  if (t.kind === "tool") {
    toolFileOk = toolFileContent !== null && !!t.toolContentPattern && t.toolContentPattern.test(toolFileContent);
  }
  const pass = completed && answerOk && formatOk && bounded && (toolFileOk !== false);
  return { completed, answerOk, formatOk, bounded, toolFileOk, pass };
}
