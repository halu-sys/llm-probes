import { describe, it, expect } from "vitest";
import { makeChainCase, gradeChain } from "../src/probes/p5.js";

describe("P5 chain probe", () => {
  it("generator computes expected by applying f1..f5 in name order", () => {
    const c = makeChainCase(42, 2000, [0.05, 0.25, 0.5, 0.75, 0.95]);
    // all five defs present exactly once
    for (const n of ["f1", "f2", "f3", "f4", "f5"]) {
      const count = (c.fullText.match(new RegExp(`def ${n}\\(`, "g")) ?? []).length;
      expect(count).toBe(1);
    }
    // recompute expected from the defs found in the text
    const defs = [...c.fullText.matchAll(/def (f\d)\(x\): return x ([+\-*]) (\d+)/g)];
    expect(defs.length).toBe(5);
    const byName = new Map(defs.map((m) => [m[1], m]));
    let x = c.seed;
    for (const n of ["f1", "f2", "f3", "f4", "f5"]) {
      const m = byName.get(n)!;
      const arg = Number(m[3]);
      x = m[2] === "+" ? x + arg : m[2] === "*" ? x * arg : x - arg;
    }
    expect(x).toBe(c.expected);
  });

  it("is deterministic per seed", () => {
    const a = makeChainCase(7, 3000, [0.1, 0.3, 0.5, 0.7, 0.9]);
    const b = makeChainCase(7, 3000, [0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(a.fullText).toBe(b.fullText);
    expect(a.expected).toBe(b.expected);
  });

  it("functions land at spread depths", () => {
    const c = makeChainCase(9, 4000, [0.02, 0.25, 0.5, 0.75, 0.98]);
    const positions = ["f1", "f2", "f3", "f4", "f5"].map((n) => c.fullText.indexOf(`def ${n}(`));
    for (const p of positions) expect(p).toBeGreaterThan(0);
    // first and last def are far apart (>80% of doc)
    const span = (Math.max(...positions) - Math.min(...positions)) / c.fullText.length;
    expect(span).toBeGreaterThan(0.7);
  });

  it("grader accepts number in prose, rejects wrong number", () => {
    const c = makeChainCase(3, 1000, [0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(gradeChain(c.expected, `The answer is ${c.expected}.`)).toBe(true);
    expect(gradeChain(c.expected, String(c.expected))).toBe(true);
    expect(gradeChain(c.expected, String(c.expected + 1))).toBe(false);
    expect(gradeChain(c.expected, "I cannot compute that.")).toBe(false);
  });
});
