type Provider = "anthropic" | "openai" | "gemini" | "openrouter" | "grok" | "mistral";
type Reasoning = "low" | "medium" | "high";
type Message = { role: "user" | "assistant"; content: string };

export const config = { runtime: "edge" };

const defaults: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-5.1",
  gemini: "gemini-3.5-flash",
  openrouter: "openai/gpt-5.1",
  grok: "grok-4.5",
  mistral: "mistral-medium-latest",
};

const developerKeys: Record<Provider, string | undefined> = {
  anthropic: process.env.SECRET_ANTHROPIC_API_KEY,
  openai: process.env.SECRET_OPENAI_API_KEY,
  gemini: process.env.SECRET_GEMINI_API_KEY,
  openrouter: process.env.SECRET_OPENROUTER_API_KEY,
  grok: process.env.SECRET_XAI_API_KEY,
  mistral: process.env.SECRET_MISTRAL_API_KEY,
};

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
});

function textFromResponse(data: any): string {
  if (typeof data?.output_text === "string") return data.output_text;
  if (typeof data?.choices?.[0]?.message?.content === "string") return data.choices[0].message.content;
  if (typeof data?.content?.[0]?.text === "string") return data.content[0].text;
  if (typeof data?.outputs?.[0]?.content === "string") return data.outputs[0].content;
  const output = data?.output ?? data?.steps ?? [];
  for (const item of output) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") return content.text;
    }
  }
  return "Le fournisseur n’a renvoyé aucun texte exploitable.";
}

function usageFromResponse(data: any): number {
  const usage = data?.usage ?? {};
  return usage.total_tokens ?? usage.totalTokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message ?? data?.message ?? `Erreur du fournisseur (${response.status}).`);
  return data;
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return json({ error: { message: "Méthode non autorisée." } }, 405);

  try {
    const body = await req.json();
    const provider = body.provider as Provider;
    const messages = body.messages as Message[];
    const reasoning = (body.reasoning ?? "medium") as Reasoning;
    const model = String(body.model || defaults[provider]);
    const apiKey = String(body.apiKey || developerKeys[provider] || "").trim();

    if (!Object.prototype.hasOwnProperty.call(defaults, provider)) throw new Error("Fournisseur non pris en charge.");
    if (!apiKey) throw new Error(`Aucune clé API n’est configurée pour ${provider}.`);
    if (!Array.isArray(messages) || !messages.length) throw new Error("La conversation est vide.");

    const cleanMessages = messages.map(({ role, content }) => ({ role, content: String(content) }));
    let data: any;

    if (provider === "openai" || provider === "grok") {
      data = await requestJson(provider === "openai" ? "https://api.openai.com/v1/responses" : "https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: cleanMessages,
          reasoning: { effort: reasoning },
          tools: [{ type: provider === "openai" ? "web_search_preview" : "web_search" }],
        }),
      });
    } else if (provider === "anthropic") {
      const budgets: Record<Reasoning, number> = { low: 1024, medium: 4096, high: 8192 };
      data = await requestJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "web-search-2025-03-05", "content-type": "application/json" },
        body: JSON.stringify({
          model, messages: cleanMessages, max_tokens: Math.max(4096, budgets[reasoning] + 2048),
          thinking: { type: "enabled", budget_tokens: budgets[reasoning] },
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
    } else if (provider === "gemini") {
      data = await requestJson("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: cleanMessages, tools: [{ type: "google_search" }], reasoning: { effort: reasoning } }),
      });
    } else if (provider === "openrouter") {
      data = await requestJson("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: cleanMessages, reasoning: { effort: reasoning }, tools: [{ type: "openrouter:web_search" }] }),
      });
    } else {
      data = await requestJson("https://api.mistral.ai/v1/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, inputs: cleanMessages, tools: [{ type: "web_search" }], completion_args: { temperature: reasoning === "low" ? 0.2 : 0.5 } }),
      });
    }

    return json({ reply: textFromResponse(data), tokenUsage: usageFromResponse(data) });
  } catch (error: any) {
    return json({ error: { message: error?.message ?? "Erreur lors de la génération." } }, 400);
  }
}
