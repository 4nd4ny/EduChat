import type { NextApiRequest, NextApiResponse } from "next";
import { getClientIp, isRateLimited, mayUseServerKeys } from "../../server/access";
import {
  ERR,
  isProviderId,
  isReasoningLevel,
  providerDefaults,
  type ProviderId,
  type ReasoningLevel,
} from "../../shared/providers";

type Message = { role: "user" | "assistant"; content: string };

// Runtime Node (et non edge) : indispensable pour lire auth_lock.json sur le
// disque avant de dépenser les clés du serveur, et requis par SQLite à l'étape 4.
export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

const developerKeys: Record<ProviderId, string | undefined> = {
  anthropic: process.env.SECRET_ANTHROPIC_API_KEY,
  openai: process.env.SECRET_OPENAI_API_KEY,
  gemini: process.env.SECRET_GEMINI_API_KEY,
  openrouter: process.env.SECRET_OPENROUTER_API_KEY,
  grok: process.env.SECRET_XAI_API_KEY,
  mistral: process.env.SECRET_MISTRAL_API_KEY,
};

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
  return "";
}

function usageFromResponse(data: any): number {
  const usage = data?.usage ?? {};
  return usage.total_tokens ?? usage.totalTokens ?? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message ?? data?.message ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const clientIp = getClientIp(req);

  // Limitation de débit par IP (30 requêtes/minute) avant tout traitement coûteux.
  if (await isRateLimited(clientIp)) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const body = req.body ?? {};
  const provider = body.provider;
  const messages = body.messages as Message[];
  const reasoning: ReasoningLevel = isReasoningLevel(body.reasoning) ? body.reasoning : "medium";

  if (!isProviderId(provider)) {
    return res.status(400).json({ error: { code: ERR.PROVIDER } });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { code: ERR.EMPTY } });
  }

  const model = String(body.model || providerDefaults[provider].model).trim();
  if (!model || model.length > 128) {
    return res.status(400).json({ error: { code: ERR.MODEL } });
  }

  // Règle d'accès : une clé personnelle (BYOK) est TOUJOURS acceptée. Sinon, les
  // clés du serveur ne sont servies que si le site est déverrouillé, ou depuis une
  // IP d'établissement pendant une plage horaire autorisée. Aucun repli silencieux
  // de l'une vers l'autre.
  const personalKey = String(body.apiKey || "").trim();
  let apiKey = personalKey;

  if (!apiKey) {
    if (!(await mayUseServerKeys(clientIp))) {
      return res.status(401).json({ error: { code: ERR.LOCKED } });
    }
    apiKey = String(developerKeys[provider] || "").trim();
    if (!apiKey) {
      return res.status(503).json({ error: { code: ERR.NO_KEY } });
    }
  }

  const cleanMessages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(({ role, content }) => ({ role, content: String(content) }));

  if (!cleanMessages.length) {
    return res.status(400).json({ error: { code: ERR.EMPTY } });
  }

  try {
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
      const budgets: Record<ReasoningLevel, number> = { low: 1024, medium: 4096, high: 8192 };
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

    return res.status(200).json({ reply: textFromResponse(data), tokenUsage: usageFromResponse(data) });
  } catch (error: any) {
    // Le détail du fournisseur est journalisé côté serveur, jamais renvoyé tel quel
    // au client (il peut contenir des informations d'infrastructure).
    console.error(`Erreur du fournisseur ${provider} :`, error?.message);
    return res.status(502).json({ error: { code: ERR.UPSTREAM } });
  }
}
