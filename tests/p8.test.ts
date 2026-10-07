import { describe, it, expect } from "vitest";
import { makeAnswerTask, makeToolTask, gradeTask, type Usage } from "../src/probes/p8.js";

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
