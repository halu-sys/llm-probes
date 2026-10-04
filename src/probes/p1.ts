import { rng, pick, randomCode } from "../rng.js";

// Procedural filler: sentences assembled from word pools — deterministic per
// seed, not from any model's training data, and token-countable by estimate.
const SUBJECTS = ["The courier", "A ledger", "Every anchor", "The orchard", "A compass", "The kiln", "Each harbor", "The almanac", "A thresher", "The glazier"] as const;
const VERBS = ["records", "measures", "shadows", "carries", "delays", "counts", "mirrors", "sorts", "weighs", "charts"] as const;
const OBJECTS = ["the tide tables", "a brass dial", "the north channel", "dried lavender", "the mill race", "a wax seal", "the frost line", "grain sacks", "window panes", "the ferry log"] as const;
const TAILS = ["before dusk", "without remark", "in careful ink", "past the third lock", "under a grey sky", "beside the boathouse", "after the second bell", "with quiet precision", "near the old weir", "during the ebb tide"] as const;

export function fillerSentence(r: () => number): string {
  return `${pick(r, SUBJECTS)} ${pick(r, VERBS)} ${pick(r, OBJECTS)} ${pick(r, TAILS)}.`;
}

// ~4 chars/token is a workable estimate for English prose in most tokenizers.
export function fillerTokensApprox(s: string): number {
  return Math.ceil(s.length / 4);
}

export type NeedleCase = {
  id: string;
  targetTokens: number;
  depth: number; // 0..1 position of needle within filler
  needle: string; // the fact sentence embedded
  fullText: string; // filler + needle, the actual document
  code: string;   // expected answer
  question: string;
};

export function makeNeedleCase(seed: number, targetTokens: number, depth: number): NeedleCase {
  const r = rng(seed);
  const code = randomCode(r);
  const animal = pick(r, ["heron", "otter", "lynx", "ferret", "badger", "magpie"]);
  const needle = `SECRET FACT: the activation code for the ${animal} protocol is ${code}.`;
  const parts: string[] = [];
  let tokens = fillerTokensApprox(needle);
  const total = Math.max(200, targetTokens - tokens);
  const needleAfterSentences = Math.floor((total * depth) / 1);
  let made = 0;
  while (made < needleAfterSentences && fillerTokensApprox(parts.join(" ")) < total * depth) {
    parts.push(fillerSentence(r));
    made++;
  }
  parts.push(needle);
  while (fillerTokensApprox(parts.join(" ")) < total) parts.push(fillerSentence(r));
  return {
    id: `p1-${seed}-${targetTokens}-${Math.round(depth * 100)}`,
    targetTokens,
    depth,
    needle,
    fullText: parts.join(" "),
    code,
    question: "What is the activation code for the animal protocol mentioned somewhere in the text above? Answer with ONLY the code, nothing else.",
  };
}

// Grader: exact code match (allow surrounding whitespace/quotes/period).
export function gradeNeedle(expected: string, answer: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const a = norm(answer);
  return a === norm(expected) || (a.length > norm(expected).length && a.includes(norm(expected)) && answer.trim().length < expected.length + 40);
}
