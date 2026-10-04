import { rng, pick, randomCode } from "../rng.js";
import { fillerSentence, fillerTokensApprox } from "./p1.js";

// P3: instruction placed at the START of a long context; question at the END.
// Measures whether format-following survives long context.
export type DecayCase = {
  id: string;
  targetTokens: number;
  instruction: string;
  fullText: string;
  question: string;
  expectedKey: string;
  expectedItems: number;
  nums: number[];
  words: string[];
};

const KEYS = ["result", "payload", "answer", "output"] as const;

export function makeDecayCase(seed: number, targetTokens: number): DecayCase {
  const r = rng(seed);
  const key = pick(r, KEYS);
  const items = 4; // sum + 3 words — must match the question below
  const nums = [Math.floor(r() * 900) + 100, Math.floor(r() * 900) + 100, Math.floor(r() * 900) + 100];
  const instruction = `FORMAT RULE (applies to your final answer): respond with ONLY a JSON object of the form {"${key}": ["a", "b", "c", "d"]} containing exactly ${items} short string items and no other text, prose, or markdown.`;
  const parts: string[] = [instruction];
  let tokens = fillerTokensApprox(instruction);
  while (tokens < targetTokens) {
    const s = fillerSentence(r);
    parts.push(s);
    tokens += fillerTokensApprox(s);
  }
  const w1 = pick(r, ["alpha", "delta", "kilo"]);
  const w2 = pick(r, ["bravo", "echo", "lima"]);
  const w3 = pick(r, ["charlie", "foxtrot", "mike"]);
  const question = `Sum the three numbers hidden in this instruction reminder: ${nums.join(", ")}. Put the sum as the first item, then the words: ${w1}, ${w2}, ${w3}. Remember the FORMAT RULE from the beginning of this document.`;
  return {
    id: `p3-${seed}-${targetTokens}`,
    targetTokens,
    instruction,
    fullText: parts.join(" "),
    question,
    expectedKey: key,
    expectedItems: items,
    nums,
    words: [w1, w2, w3],
  };
}

// Grader: valid JSON, correct key, exactly N items, first item = sum.
export function gradeDecay(c: DecayCase, answer: string): boolean {
  const nums = c.nums;
  const trimmed = answer.trim().replace(/^```(?:json)?|```$/g, "").trim();
  let obj: any;
  try { obj = JSON.parse(trimmed); } catch { return false; }
  if (!obj || typeof obj !== "object") return false;
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== c.expectedKey) return false;
  const arr = obj[c.expectedKey];
  if (!Array.isArray(arr) || arr.length !== c.expectedItems) return false;
  const sum = nums.reduce((a, b) => a + b, 0);
  return String(arr[0]).includes(String(sum));
}

// Strict grader: every item must match its expected value exactly.
// Catches the "lima charlie" merge that the lenient grader accepts.
export function gradeDecayStrict(c: DecayCase, answer: string): { pass: boolean; merged: boolean; detail: string } {
  const trimmed = answer.trim().replace(/^```(?:json)?|```$/g, "").trim();
  let obj: any;
  try { obj = JSON.parse(trimmed); } catch { return { pass: false, merged: false, detail: "invalid JSON" }; }
  const arr = obj?.[c.expectedKey];
  if (!Array.isArray(arr)) return { pass: false, merged: false, detail: "missing array" };
  const sum = String(c.nums.reduce((a, b) => a + b, 0));
  const expected = [sum, ...c.words];
  if (arr.length === expected.length) {
    const ok = arr.every((v: unknown, i: number) => String(v).trim() === expected[i]);
    if (ok) return { pass: true, merged: false, detail: "exact" };
  }
  // merge detection: fewer items, but concatenations of expected values present
  const joined = arr.map((v: unknown) => String(v).trim()).join(" ");
  const allPresent = expected.every((e) => joined.includes(e));
  return { pass: false, merged: allPresent && arr.length < expected.length, detail: `${arr.length} items (expected ${expected.length})` };
}
