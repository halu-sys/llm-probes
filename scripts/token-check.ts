import { makeCodeCase } from "../src/probes/p6.js";
async function main() {
  const c = makeCodeCase(7002, 256000, 6, [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]);
  const res = await fetch("http://localhost:1236/tokenize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: c.fullText, add_bos: true }),
  });
  const j = (await res.json()) as any;
  console.log("P6-256k actual tokens:", j.tokens?.length ?? JSON.stringify(j).slice(0, 200));
}
main().catch((e) => console.error(e.message));
