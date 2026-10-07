import { describe, it, expect } from "vitest";
import {
  makeChainCase, hop1Prompt, hopNPrompt, gradeChain,
  makeFanCase, gradeFan,
} from "../src/probes/p7.js";

describe("P7 chain generator", () => {
  it("is deterministic for a given seed", () => {
    const a = makeChainCase(1, 3);
    const b = makeChainCase(1, 3);
    expect(a.expected).toBe(b.expected);
    expect(a.code).toBe(b.code);
    expect(a.hops.map((h) => h.op)).toEqual(b.hops.map((h) => h.op));
  });

  it("computes expected by applying ops in order", () => {
    const c = makeChainCase(42, 5);
    let x = c.seedVal;
    for (const h of c.hops) x = h.op.kind === "add" ? x + h.op.arg : h.op.kind === "mul" ? x * h.op.arg : x - h.op.arg;
    expect(c.expected).toBe(x);
  });

  it("hop1 prompt carries seed, code, and constraints", () => {
    const c = makeChainCase(7, 3);
    const p = hop1Prompt(c);
    expect(p).toContain(String(c.seedVal));
    expect(p).toContain(c.code);
    for (const w of c.forbidden) expect(p).toContain(w);
  });

  it("hopN prompt embeds the previous output verbatim", () => {
    const c = makeChainCase(7, 3);
    const prev = `VALUE: 12\nCODE: ${c.code}\nNOTES: ok`;
    const p = hopNPrompt(c, 1, prev);
    expect(p).toContain(prev);
  });
});

describe("P7 chain grader", () => {
  const c = makeChainCase(3, 2);
  const good = `VALUE: ${c.expected}\nCODE: ${c.code}\nNOTES: done`;

  it("passes a perfect answer", () => {
    expect(gradeChain(c, good).pass).toBe(true);
  });
  it("fails on wrong value", () => {
    const g = gradeChain(c, `VALUE: ${c.expected + 1}\nCODE: ${c.code}\nNOTES: done`);
    expect(g.valueOk).toBe(false);
    expect(g.pass).toBe(false);
  });
  it("fails on lost/mangled code", () => {
    const g = gradeChain(c, `VALUE: ${c.expected}\nCODE: XXXX-YYYY\nNOTES: done`);
    expect(g.codeOk).toBe(false);
    expect(g.pass).toBe(false);
  });
  it("fails on forbidden word in NOTES", () => {
    const g = gradeChain(c, `VALUE: ${c.expected}\nCODE: ${c.code}\nNOTES: I carefully checked`);
    expect(g.cleanNotes).toBe(false);
    expect(g.pass).toBe(false);
  });
  it("fails on extra lines (format drift)", () => {
    const g = gradeChain(c, `${good}\nBONUS: something`);
    expect(g.formatOk).toBe(false);
    expect(g.pass).toBe(false);
  });
});

describe("P7 fan-out", () => {
  it("expectedSum matches fact values", () => {
    const c = makeFanCase(9, 4);
    expect(c.expectedSum).toBe(c.facts.reduce((s, f) => s + f.value, 0));
    expect(c.facts.length).toBe(4);
  });
  it("merge grader accepts correct sum + code", () => {
    const c = makeFanCase(9, 4);
    expect(gradeFan(c, `SUM: ${c.expectedSum}\nCODE: ${c.code}`).pass).toBe(true);
  });
  it("merge grader rejects dropped-worker sum", () => {
    const c = makeFanCase(9, 4);
    const short = c.expectedSum - c.facts[0].value;
    expect(gradeFan(c, `SUM: ${short}\nCODE: ${c.code}`).valueOk).toBe(false);
  });
});
