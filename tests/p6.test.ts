import { describe, it, expect } from "vitest";
import { makeCodeCase, gradeCode } from "../src/probes/p6.js";

describe("P6 code comprehension probe", () => {
  it("core defined once, each caller calls it exactly once", () => {
    const c = makeCodeCase(11, 4000, 6, [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]);
    const coreDefs = (c.fullText.match(new RegExp(`def ${c.core}\\(`, "g")) ?? []).length;
    expect(coreDefs).toBe(1);
    for (const name of c.callers) {
      const calls = (c.fullText.match(new RegExp(`${c.core}\\(`, "g")) ?? []).length;
      expect(calls).toBeGreaterThan(c.callers.length); // core called by all callers
      const def = (c.fullText.match(new RegExp(`def ${name}\\(`, "g")) ?? []).length;
      expect(def).toBe(1);
    }
  });

  it("callers are spread far apart in the document", () => {
    const c = makeCodeCase(12, 8000, 6, [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]);
    const pos = c.callers.map((n) => c.fullText.indexOf(`def ${n}(`));
    for (const p of pos) expect(p).toBeGreaterThan(0);
    const span = (Math.max(...pos) - Math.min(...pos)) / c.fullText.length;
    expect(span).toBeGreaterThan(0.7);
  });

  it("deterministic per seed", () => {
    const a = makeCodeCase(13, 5000, 5, [0.1, 0.3, 0.5, 0.7, 0.9]);
    const b = makeCodeCase(13, 5000, 5, [0.1, 0.3, 0.5, 0.7, 0.9]);
    expect(a.fullText).toBe(b.fullText);
    expect(a.core).toBe(b.core);
  });

  it("grader: exact set passes, missing fails, extra fails", () => {
    const c = makeCodeCase(14, 3000, 4, [0.1, 0.4, 0.7, 0.95]);
    const good = c.callers.join(", ");
    expect(gradeCode(c, good).pass).toBe(true);
    expect(gradeCode(c, c.callers.slice(0, -1).join(", ")).missing.length).toBe(1);
    const wrong = [...c.callers.slice(0, -1), c.definedNames.find((n) => !c.callers.includes(n))!].join(", ");
    const g = gradeCode(c, wrong);
    expect(g.extra.length).toBe(1);
    expect(g.pass).toBe(false);
  });
});
