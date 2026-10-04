import { makeCodeCase } from "../src/probes/p6.js";
for (const size of [32000, 128000, 256000]) {
  const t0 = Date.now();
  const c = makeCodeCase(7001, size, 6, [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]);
  console.log(`${size}: gen ${Date.now() - t0}ms, chars=${c.fullText.length}, callers=${c.callers.length}, defined=${c.definedNames.length}`);
}
