// Mulberry32 seeded PRNG — reproducible probe generation.
export function rng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

// Random uppercase alphanumeric code, e.g. "7XQ4-KZ2P"
export function randomCode(r: () => number, groups = 2, size = 4): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const g: string[] = [];
  for (let i = 0; i < groups; i++) {
    let s = "";
    for (let j = 0; j < size; j++) s += A[Math.floor(r() * A.length)];
    g.push(s);
  }
  return g.join("-");
}
