import { describe, it, expect } from "vitest";
import { makeDecayCase, gradeDecay } from "../src/probes/p3.js";
import { repetitionRate, detectLoop } from "../src/probes/p4.js";

describe("p3 decay case", () => {
  it("deterministic per seed", () => {
    const a = makeDecayCase(1, 1000), b = makeDecayCase(1, 1000);
    expect(a.instruction).toBe(b.instruction);
    expect(a.nums).toEqual(b.nums);
  });
  it("instruction is first in fullText", () => {
    const c = makeDecayCase(2, 1000);
    expect(c.fullText.startsWith(c.instruction)).toBe(true);
  });
  it("grader accepts correct JSON", () => {
    const c = makeDecayCase(3, 500);
    const sum = c.nums.reduce((a, b) => a + b, 0);
    const ans = `{"${c.expectedKey}": ["${sum}", "x", "y"]}`;
    expect(gradeDecay(c, ans)).toBe(true);
  });
  it("grader accepts fenced JSON", () => {
    const c = makeDecayCase(4, 500);
    const sum = c.nums.reduce((a, b) => a + b, 0);
    const ans = "```json\n" + `{"${c.expectedKey}": ["${sum}", "x", "y"]}` + "\n```";
    expect(gradeDecay(c, ans)).toBe(true);
  });
  it("grader rejects prose", () => {
    const c = makeDecayCase(5, 500);
    expect(gradeDecay(c, "The sum is 123.")).toBe(false);
  });
  it("grader rejects wrong key", () => {
    const c = makeDecayCase(6, 500);
    const sum = c.nums.reduce((a, b) => a + b, 0);
    expect(gradeDecay(c, `{"wrong": ["${sum}", "x", "y"]}`)).toBe(false);
  });
  it("grader rejects wrong item count", () => {
    const c = makeDecayCase(7, 500);
    const sum = c.nums.reduce((a, b) => a + b, 0);
    expect(gradeDecay(c, `{"${c.expectedKey}": ["${sum}"]}`)).toBe(false);
  });
  it("grader rejects wrong sum", () => {
    const c = makeDecayCase(8, 500);
    expect(gradeDecay(c, `{"${c.expectedKey}": ["999999", "x", "y"]}`)).toBe(false);
  });
});

describe("p4 repetitionRate", () => {
  it("zero for no repeats", () => {
    expect(repetitionRate("the quick brown fox jumps over lazy dogs")).toBe(0);
  });
  it("detects repeated 4-gram", () => {
    const t = "alpha beta gamma delta alpha beta gamma delta";
    expect(repetitionRate(t)).toBeGreaterThan(0);
  });
  it("short text is zero", () => expect(repetitionRate("one two")).toBe(0));
});

describe("p4 detectLoop", () => {
  const block = "the model keeps saying this exact phrase over ";
  it("detects 3x tail repeat", () => {
    expect(detectLoop(block.repeat(3))).toBe(true);
  });
  it("no false positive on unique text", () => {
    expect(detectLoop("completely different words here and there nothing repeated at all indeed")).toBe(false);
  });
});
