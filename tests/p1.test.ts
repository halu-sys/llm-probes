import { describe, it, expect } from "vitest";
import { rng, randomCode } from "../src/rng.js";
import { makeNeedleCase, gradeNeedle, fillerTokensApprox } from "../src/probes/p1.js";

describe("rng", () => {
  it("is deterministic per seed", () => {
    const a = rng(42), b = rng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it("differs across seeds", () => {
    const a = rng(1), b = rng(2);
    expect(a()).not.toBe(b());
  });
  it("randomCode shape", () => {
    const r = rng(7);
    const c = randomCode(r);
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});

describe("p1 needle case", () => {
  it("deterministic per seed", () => {
    const a = makeNeedleCase(9, 2000, 0.5);
    const b = makeNeedleCase(9, 2000, 0.5);
    expect(a.needle).toBe(b.needle);
    expect(a.code).toBe(b.code);
  });
  it("needle appears exactly once in fullText", () => {
    const c = makeNeedleCase(3, 3000, 0.25);
    expect(c.fullText.split(c.code).length - 1).toBe(1);
    expect(c.fullText).toContain(c.needle);
  });
  it("fullText approximates target size", () => {
    const c = makeNeedleCase(5, 4000, 0.5);
    const est = fillerTokensApprox(c.fullText);
    expect(est).toBeGreaterThan(3000);
    expect(est).toBeLessThan(6000);
  });
  it("depth affects nothing structurally (id encodes it)", () => {
    const c = makeNeedleCase(11, 1000, 0.75);
    expect(c.id).toContain("75");
  });
});

describe("gradeNeedle", () => {
  const code = "7XQ4-KZ2P";
  it("exact match passes", () => expect(gradeNeedle(code, "7XQ4-KZ2P")).toBe(true));
  it("case-insensitive", () => expect(gradeNeedle(code, "7xq4-kz2p")).toBe(true));
  it("surrounding punctuation ok", () => expect(gradeNeedle(code, "**7XQ4-KZ2P.**")).toBe(true));
  it("short wrapper ok", () => expect(gradeNeedle(code, "The code is 7XQ4-KZ2P")).toBe(true));
  it("wrong code fails", () => expect(gradeNeedle(code, "ABCD-1234")).toBe(false));
  it("long rambling answer containing code fails (must be concise)", () =>
    expect(gradeNeedle(code, "I think the code might be 7XQ4-KZ2P but I am not sure because the text was very long and I recall seeing it near the middle of the document somewhere.")).toBe(false));
  it("empty fails", () => expect(gradeNeedle(code, "")).toBe(false));
});
