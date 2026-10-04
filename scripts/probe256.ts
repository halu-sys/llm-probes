import { makeCodeCase } from "../src/probes/p6.js";
async function main() {
  const c = makeCodeCase(7002, 256000, 6, [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]);
  console.log("chars:", c.fullText.length);
  const t0 = Date.now();
  const res = await fetch("http://localhost:1236/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({
      model: "flash",
      messages: [{ role: "user", content: `${c.fullText}\n\n${c.question}` }],
      max_tokens: 4096,
      temperature: 0,
      stream: false,
    }),
  });
  console.log("HTTP", res.status, "in", Date.now() - t0, "ms");
  const txt = await res.text();
  console.log(txt.slice(0, 400));
}
main().catch((e) => console.error("ERR:", e.message));
