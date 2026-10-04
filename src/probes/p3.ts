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
};

const KEYS = ["result", "payload", "answer", "output"] as const;

export function makeDecayCase(seed: number, targetTokens: number): DecayCase {
  const r = rng(seed);
  const key = pick(r, KEYS);
  const items = 3;
  const nums = [Math.floor(r() * 900) + 100, Math.floor(r() * 900) + 100, Math.floor(r() * 900) + 100];
  const instruction = `FORMAT RULE (applies to your final answer): respond with ONLY a JSON object of the form {"${key}": ["a", "b", "c"]} containing exactly ${items} short string items and no other text, prose, or markdown.`;
  const parts: string[] = [instruction];
  let tokens = fillerTokensApprox(instruction);
  while (tokens < targetTokens) {
    const s = fillerSentence(r);
    parts.push(s);
    tokens += fillerTokensApprox(s);
  }
  const question = `Sum the three numbers hidden in this instruction reminder: ${nums.join(", ")}. Put the sum as the first item, then the words: ${pick(r, ["alpha", "delta", "kilo"])}, ${pick(r, ["bravo", "echo", "lima"])}, ${pick(r, ["charlie", "foxtrot", "mike"])}. Remember the FORMAT RULE from the beginning of this document.`;
  return {
    id: `p3-${seed}-${targetTokens}`,
    targetTokens,
    instruction,
    fullText: parts.join(" "),
    question,
    expectedKey: key,
    expectedItems: items,
    nums,
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
