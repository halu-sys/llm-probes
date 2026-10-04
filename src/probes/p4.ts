// P4: degeneration/loop statistics over N short generations.
// Pure statistics — no model grading.

// Fraction of repeated n-grams (default n=4 words) in generated text.
export function repetitionRate(text: string, n = 4): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < n + 1) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n).join(" ");
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  const total = words.length - n + 1;
  let dupes = 0;
  for (const c of grams.values()) if (c > 1) dupes += c - 1;
  return dupes / total;
}

// Detect a tail that repeats a block verbatim >= k times (classic loop).
export function detectLoop(text: string, blockWords = 8, k = 3): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < blockWords * k) return false;
  const tail = words.slice(-blockWords).join(" ");
  let count = 0, idx = 0;
  while ((idx = text.indexOf(tail, idx)) !== -1) { count++; idx += 1; }
  return count >= k;
}
