import type { NextApiRequest, NextApiResponse } from "next";
import { getClientIp, isRateLimited, mayUseServerKeys } from "../../server/access";
import { getDb, PromptRow } from "../../server/db";
import { getPublishedByName, getByShareToken } from "../../server/prompts";
import { resolveEtablissementByIp, studentDayUsage } from "../../server/etablissements";
import {
  ERR,
  isProviderId,
  isReasoningLevel,
  providerDefaults,
  type ProviderId,
  type ReasoningLevel,
} from "../../shared/providers";

type Message = { role: "user" | "assistant"; content: string };

// Runtime Node (et non edge) : indispensable pour lire auth_lock.json et la
// base SQLite avant de dépenser les clés du serveur.
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

/**
 * Résout le tuteur socratique demandé, côté serveur exclusivement :
 * - par NOM : prompts publiés uniquement, dans la VERSION mémorisée par la
 *   conversation (bascule de version toujours explicite — décision n°9) ;
 * - par URL SECRÈTE (shareToken) : brouillons « en construction », pour le
 *   flux de test de l'étape 7 ; jamais les pending/retired par nom.
 */
function resolveSystemPrompt(promptName: string, promptVersion: number, shareToken: string):
  { row: PromptRow; system: string } | 'unknown' | null {
  if (shareToken) {
    const row = getByShareToken(shareToken);
    if (!row) return 'unknown';
    return { row, system: row.body };
  }
  if (!promptName) return null;
  const row = getPublishedByName(promptName);
  if (!row) return 'unknown';
  if (promptVersion > 0 && promptVersion !== row.version) {
    const old = getDb().prepare('SELECT body FROM prompt_versions WHERE prompt_id = ? AND version = ?')
      .get(row.id, promptVersion) as { body: string } | undefined;
    if (old) return { row, system: old.body };
  }
  return { row, system: row.body };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const clientIp = getClientIp(req);
  if (await isRateLimited(clientIp, 30, 'completion')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const body = req.body ?? {};
  const provider = body.provider;
  const messages = body.messages as Message[];
  const reasoning: ReasoningLevel = isReasoningLevel(body.reasoning) ? body.reasoning : "medium";
  const promptName = String(body.promptName ?? "").slice(0, 64);
  const promptVersion = Number.isInteger(body.promptVersion) ? Number(body.promptVersion) : 0;
  const shareToken = String(body.shareToken ?? "").slice(0, 64);
  // Identifiant ANONYME de navigateur (uuid aléatoire côté client) : support du
  // quota quotidien par élève — pseudonyme, jamais relié à une identité.
  const clientId = /^[a-f0-9-]{8,64}$/i.test(String(body.clientId ?? "")) ? String(body.clientId) : "";

  if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { code: ERR.EMPTY } });
  }

  const model = String(body.model || providerDefaults[provider].model).trim();
  if (!model || model.length > 128) return res.status(400).json({ error: { code: ERR.MODEL } });

  // Tuteur socratique : résolu et injecté CÔTÉ SERVEUR — le texte du prompt ne
  // transite jamais par le client pendant le chat.
  const resolved = resolveSystemPrompt(promptName, promptVersion, shareToken);
  if (resolved === 'unknown') return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
  const system = resolved?.system ?? "";
  const promptRow = resolved?.row ?? null;

  // Recherche web : décidée par le PROMPTAGOGUE pour un tuteur (champ
  // web_search, désactivé par défaut — économie de tokens) ; activée pour le
  // chat libre. Le réglage de session posé par l'enseignant (étape 14) peut la
  // FORCER À OFF pour tout son établissement — jamais la forcer à on.
  let webSearch = promptRow ? !!promptRow.web_search : true;

  // Règle d'accès : clé personnelle toujours acceptée ; clés serveur seulement
  // si déverrouillé OU IP d'établissement en plage horaire. Aucun repli.
  const personalKey = String(body.apiKey || "").trim();
  let apiKey = personalKey;
  const usedServerKey = !personalKey;
  const etab = usedServerKey ? resolveEtablissementByIp(clientIp) : null;
  const etablissementId = etab?.id ?? null;
  // Pseau du quota par élève : le clientId anonyme s'il est valide, SINON l'IP
  // elle-même — de sorte qu'omettre ou trafiquer le clientId ne contourne pas
  // le quota (il rejoint alors le pot commun de l'IP) plutôt que de l'annuler.
  const studentBucket = etab ? (clientId || `ip:${clientIp}`) : "";

  // Réglages de session actifs de l'établissement (étape 14) : override de la
  // recherche web + attribution de la consommation à l'enseignant qui a ouvert
  // la session (bilan mensuel par enseignant).
  let teacherEmail: string | null = null;
  if (etablissementId) {
    const settings = getDb().prepare(
      'SELECT web_search, set_by_email FROM session_settings WHERE etablissement_id = ? AND expires_at > ?')
      .get(etablissementId, Date.now()) as { web_search: number; set_by_email: string | null } | undefined;
    if (settings) {
      if (!settings.web_search) webSearch = false;
      teacherEmail = settings.set_by_email;
    }
  }

  if (!apiKey) {
    if (!(await mayUseServerKeys(clientIp))) {
      return res.status(401).json({ error: { code: ERR.LOCKED } });
    }
    // Plafond MENSUEL de l'établissement (0 = illimité, mois UTC) : la clé
    // interne cesse de répondre quand le budget est épuisé.
    if (etab && etab.token_quota_monthly > 0) {
      const now = new Date();
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const used = (getDb().prepare(
        'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE etablissement_id = ? AND ts >= ?')
        .get(etab.id, monthStart) as { total: number }).total;
      if (used >= etab.token_quota_monthly) {
        return res.status(429).json({ error: { code: 'ERR_QUOTA_ETABLISSEMENT' } });
      }
    }
    // Quota QUOTIDIEN PAR ÉLÈVE (0 = illimité, jour UTC), défini par le
    // responsable. L'« élève » est un navigateur anonyme (studentBucket) :
    // contournable en vidant le stockage ou en tournant l'identifiant, assumé
    // comme « assez bon » dans le modèle de confiance d'une classe — le plafond
    // MENSUEL reste le vrai garde-fou budgétaire (à définir non nul).
    if (etab && etab.quota_per_student_daily > 0) {
      if (studentDayUsage(etab.id, studentBucket) >= etab.quota_per_student_daily) {
        return res.status(429).json({ error: { code: 'ERR_QUOTA_ELEVE' } });
      }
    }
    apiKey = String(developerKeys[provider] || "").trim();
    if (!apiKey) return res.status(503).json({ error: { code: ERR.NO_KEY } });
  }

  const cleanMessages = messages
    .filter(m => m && (m.role === "user" || m.role === "assistant"))
    .map(({ role, content }) => ({ role, content: String(content) }));
  if (!cleanMessages.length) return res.status(400).json({ error: { code: ERR.EMPTY } });

  // Pour les API à liste de messages, le prompt système est un message system
  // en tête ; Anthropic a son champ `system` dédié.
  const withSystem = system ? [{ role: "system", content: system }, ...cleanMessages] : cleanMessages;

  try {
    let data: any;

    if (provider === "openai" || provider === "grok") {
      data = await requestJson(provider === "openai" ? "https://api.openai.com/v1/responses" : "https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          input: withSystem,
          reasoning: { effort: reasoning },
          ...(webSearch ? { tools: [{ type: provider === "openai" ? "web_search_preview" : "web_search" }] } : {}),
        }),
      });
    } else if (provider === "anthropic") {
      const budgets: Record<ReasoningLevel, number> = { low: 1024, medium: 4096, high: 8192 };
      data = await requestJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "web-search-2025-03-05", "content-type": "application/json" },
        body: JSON.stringify({
          model, messages: cleanMessages, max_tokens: Math.max(4096, budgets[reasoning] + 2048),
          ...(system ? { system } : {}),
          thinking: { type: "enabled", budget_tokens: budgets[reasoning] },
          ...(webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
        }),
      });
    } else if (provider === "gemini") {
      data = await requestJson("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, input: withSystem,
          ...(webSearch ? { tools: [{ type: "google_search" }] } : {}),
          reasoning: { effort: reasoning },
        }),
      });
    } else if (provider === "openrouter") {
      data = await requestJson("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, messages: withSystem, reasoning: { effort: reasoning },
          ...(webSearch ? { tools: [{ type: "openrouter:web_search" }] } : {}),
        }),
      });
    } else {
      data = await requestJson("https://api.mistral.ai/v1/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, inputs: withSystem,
          ...(webSearch ? { tools: [{ type: "web_search" }] } : {}),
          completion_args: { temperature: reasoning === "low" ? 0.2 : 0.5 },
        }),
      });
    }

    const tokenUsage = usageFromResponse(data);

    // Statistiques — uniquement après une complétion RÉUSSIE :
    // compteurs publics du tuteur + journal de consommation. Le journal ne
    // porte l'IP que pour la clé INTERNE (donnée de facturation d'un
    // établissement scolaire) — jamais pour les clés personnelles.
    try {
      const db = getDb();
      db.transaction(() => {
        if (promptRow) {
          db.prepare('UPDATE prompts SET usage_count = usage_count + 1, tokens_total = tokens_total + ? WHERE id = ?')
            .run(tokenUsage, promptRow.id);
        }
        if (usedServerKey) {
          db.prepare(`
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, used_server_key, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `).run(Date.now(), clientIp, etablissementId, teacherEmail, promptRow?.id ?? null, provider, model, tokenUsage, studentBucket);
        }
      })();
    } catch (statsError) {
      console.error('Statistiques non enregistrées :', statsError);
      // La réponse de chat n'est jamais sacrifiée pour une statistique.
    }

    return res.status(200).json({
      reply: textFromResponse(data),
      tokenUsage,
      ...(promptRow ? { promptName: promptRow.name, promptVersion: promptVersion > 0 ? promptVersion : promptRow.version } : {}),
    });
  } catch (error: any) {
    console.error(`Erreur du fournisseur ${provider} :`, error?.message);
    return res.status(502).json({ error: { code: ERR.UPSTREAM } });
  }
}
