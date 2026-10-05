import { chat } from "../src/client.js";
async function main() {
  const r = await chat([{ role: "user", content: "Say OK." }], { model: "flash", maxTokens: 64, temperature: 0 });
  console.log("client smoke:", JSON.stringify(r.text), "finish=", r.finish, "ms=", r.ms);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
