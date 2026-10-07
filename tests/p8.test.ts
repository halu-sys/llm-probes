import { describe, it, expect } from "vitest";
import { makeAnswerTask, makeToolTask, makeMultiStepTask, gradeTask, type Usage } from "../src/probes/p8.js";

const okUsage: Usage = {
  input_tokens: 13000, output_tokens: 20, api_calls: 1,
  completed: true, failed: false, interrupted: false, turn_exit_reason: "text_response(stop)", model: "coder",
};

describe("P8 answer task", () => {
  it("is deterministic", () => {
    const a = makeAnswerTask(1, "coder", 0);
    const b = makeAnswerTask(1, "coder", 0);
    expect(a.prompt).toBe(b.prompt);
    expect(a.expectPattern.source).toBe(b.expectPattern.source);
  });

  it("expects the right arithmetic (extract operands from prompt)", () => {
    const t = makeAnswerTask(5, "coder", 0);
    const m = t.prompt.match(/Compute (\d+) ([*+]) (\d+)/);
    expect(m).not.toBeNull();
    const [, x, op, y] = m!;
    const expected = op === "*" ? Number(x) * Number(y) : Number(x) + Number(y);
    const good = `RESULT: ${expected}\nCODE: ${t.formatMarkers[2]}`;
    expect(gradeTask(t, good, okUsage, null).pass).toBe(true);
  });

  it("fails on wrong number", () => {
    const t = makeAnswerTask(5, "coder", 0);
    const m = t.prompt.match(/Compute (\d+) ([*+]) (\d+)/)!;
    const wrong = Number(m[1]) + Number(m[3]) + 1;
    const bad = `RESULT: ${wrong}\nCODE: ${t.formatMarkers[2]}`;
    expect(gradeTask(t, bad, okUsage, null).answerOk).toBe(false);
  });

  it("fails when loop cap exceeded", () => {
    const t = makeAnswerTask(5, "coder", 0);
    const good = `RESULT: 0\nCODE: ${t.formatMarkers[2]}`;
    const g = gradeTask(t, good, { ...okUsage, api_calls: t.apiCallCap + 1 }, null);
    expect(g.bounded).toBe(false);
    expect(g.pass).toBe(false);
  });

  it("fails when boot tokens exceed cap (context bloat guard)", () => {
    const t = makeAnswerTask(5, "coder", 0);
    const g = gradeTask(t, `x`, { ...okUsage, input_tokens: t.inputTokenCap + 1 }, null);
    expect(g.bounded).toBe(false);
  });

  it("fails on interrupted/incomplete usage", () => {
    const t = makeAnswerTask(5, "coder", 0);
    const g = gradeTask(t, `RESULT: 0\nCODE: ${t.formatMarkers[2]}`, { ...okUsage, interrupted: true }, null);
    expect(g.completed).toBe(false);
    expect(g.pass).toBe(false);
  });
});

describe("P8 tool task", () => {
  it("passes when file written with expected content", () => {
    const t = makeToolTask(3, "coder", 0, "/tmp/p8test");
    const content = t.toolContentPattern!.source;
    const g = gradeTask(t, `WROTE ${t.toolFile!.split("/").pop()}`, okUsage, content);
    expect(g.pass).toBe(true);
    expect(g.toolFileOk).toBe(true);
  });

  it("fails when file missing", () => {
    const t = makeToolTask(3, "coder", 0, "/tmp/p8test");
    const g = gradeTask(t, `WROTE ${t.toolFile!.split("/").pop()}`, okUsage, null);
    expect(g.toolFileOk).toBe(false);
    expect(g.pass).toBe(false);
  });

  it("fails when file content wrong (agent wrote something else)", () => {
    const t = makeToolTask(3, "coder", 0, "/tmp/p8test");
    const g = gradeTask(t, `WROTE x`, okUsage, "totally different");
    expect(g.toolFileOk).toBe(false);
  });
});

describe("P8 multistep task", () => {
  it("file pattern demands START + all step lines in order", () => {
    const t = makeMultiStepTask(11, "coder", 4, "/tmp/p8test");
    const vals = [...t.prompt.matchAll(/step\d+ value (\d+)/g)].map((m) => Number(m[1]));
    expect(vals.length).toBe(4);
    const good = `START\n${vals.map((v, i) => `step${i + 1} value ${v}`).join("\n")}`;
    expect(t.toolContentPattern!.test(good)).toBe(true);
    expect(t.toolContentPattern!.test("START\nstep1 value 999")).toBe(false);
  });

  it("passes with full file, correct sum, calls in window", () => {
    const t = makeMultiStepTask(11, "coder", 4, "/tmp/p8test");
    const vals = [...t.prompt.matchAll(/step(\d+) value (\d+)/g)].map((m) => Number(m[2]));
    const sum = vals.reduce((s, v) => s + v, 0);
    const file = `START\n${vals.map((v, i) => `step${i + 1} value ${v}`).join("\n")}`;
    const g = gradeTask(t, `FILE_OK yes\nSUM: ${sum}`, { ...okUsage, api_calls: 7 }, file);
    expect(g.pass).toBe(true);
  });

  it("fails when steps were skipped (too few calls = faked it)", () => {
    const t = makeMultiStepTask(11, "coder", 6, "/tmp/p8test");
    const g = gradeTask(t, `FILE_OK yes\nSUM: 0`, { ...okUsage, api_calls: 2 }, "START");
    expect(g.bounded).toBe(false); // below minCalls
    expect(g.pass).toBe(false);
  });

  it("fails on loop (too many calls)", () => {
    const t = makeMultiStepTask(11, "coder", 4, "/tmp/p8test");
    const g = gradeTask(t, `x`, { ...okUsage, api_calls: 50 }, null);
    expect(g.bounded).toBe(false);
  });
});
