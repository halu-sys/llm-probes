// Minimal OpenAI-compatible client for llama-swap (:1236).
// Uses node:http directly: global fetch (undici) enforces a 300s
// headersTimeout that CANNOT be raised via fetch init, and model swaps
// (unload flash + load 26GB qwen27b) can exceed it.
import http from "node:http";

export type ChatOpts = {
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export async function chat(
  messages: { role: string; content: string }[],
  opts: ChatOpts,
): Promise<{ text: string; reasoning: string; finish: string; promptTokens: number; completionTokens: number; ms: number }> {
  const base = opts.baseUrl ?? "http://localhost:1236/v1";
  const u = new URL(`${base}/chat/completions`);
  const t0 = Date.now();
  const body = JSON.stringify({
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens ?? 64,
    temperature: opts.temperature ?? 0,
    stream: false,
  });

  const raw = await new Promise<string>((resolve, reject) => {
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          else resolve(data);
        });
      },
    );
    req.setTimeout(opts.timeoutMs ?? 1_800_000, () => req.destroy(new Error(`client timeout after ${opts.timeoutMs ?? 1_800_000} ms`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  const ms = Date.now() - t0;
  const j = JSON.parse(raw) as any;
  return {
    text: j.choices?.[0]?.message?.content ?? "",
    reasoning: j.choices?.[0]?.message?.reasoning_content ?? "",
    finish: j.choices?.[0]?.finish_reason ?? "",
    promptTokens: j.usage?.prompt_tokens ?? 0,
    completionTokens: j.usage?.completion_tokens ?? 0,
    ms,
  };
}
