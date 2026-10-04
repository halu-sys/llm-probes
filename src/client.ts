// Minimal OpenAI-compatible client for llama-swap (:1236).
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
): Promise<{ text: string; promptTokens: number; completionTokens: number; ms: number }> {
  const base = opts.baseUrl ?? "http://localhost:1236/v1";
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 600_000),
    body: JSON.stringify({
      model: opts.model,
      messages,
      max_tokens: opts.maxTokens ?? 64,
      temperature: opts.temperature ?? 0,
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as any;
  const ms = Date.now() - t0;
  return {
    text: j.choices?.[0]?.message?.content ?? "",
    promptTokens: j.usage?.prompt_tokens ?? 0,
    completionTokens: j.usage?.completion_tokens ?? 0,
    ms,
  };
}
