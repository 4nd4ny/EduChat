import type { NextApiRequest, NextApiResponse } from "next";
import { getClientIp, isRateLimited, mayUseServerKeys } from "../../server/access";
import { getDb, PromptRow } from "../../server/db";
import { getPublishedByName, getByShareToken } from "../../server/prompts";
import { resolveEtablissementByIp, studentDayUsage } from "../../server/etablissements";
import { FreeProvider, FreeModel, FreeModels } from "../../utils/env";
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

  // Règle d'accès, par ordre de priorité :
  //  1. clé personnelle (BYOK) → toujours acceptée, avec le fournisseur/modèle du client ;
  //  2. site déverrouillé OU IP d'établissement en plage horaire → clé interne
  //     du fournisseur choisi, soumise aux quotas (facturée, journalisée avec l'IP) ;
  //  3. REPLI GRATUIT public → fournisseur + modèle gratuits configurés
  //     (SECRET_FREE_PROVIDER / SECRET_FREE_MODEL), avec la clé serveur de ce
  //     fournisseur : le site « marche un peu » sans rien saisir. JAMAIS journalisé
  //     avec l'IP (pas d'établissement, pas de donnée personnelle) ;
  //  4. sinon → verrouillé (401).
  const personalKey = String(body.apiKey || "").trim();
  let apiKey = personalKey;
  let effProvider: ProviderId = provider;   // fournisseur RÉELLEMENT utilisé
  let effModel = model;                      // modèle RÉELLEMENT utilisé
  let usedServerKey = false;                 // clé interne (établissement/déverrouillé) → journal + IP
  let usedFreeKey = false;                   // clé gratuite publique → journal sans IP
  let etablissementId: number | null = null;
  let studentBucket = "";
  let teacherEmail: string | null = null;

  if (!personalKey) {
    const etab = resolveEtablissementByIp(clientIp);
    etablissementId = etab?.id ?? null;
    // Pot du quota par élève : clientId anonyme si valide, SINON l'IP — omettre
    // ou trafiquer le clientId rejoint le pot commun de l'IP, sans annuler le quota.
    studentBucket = etab ? (clientId || `ip:${clientIp}`) : "";

    // Réglages de session actifs (étape 14) : override recherche web + attribution enseignant.
    if (etablissementId) {
      const settings = getDb().prepare(
        'SELECT web_search, set_by_email FROM session_settings WHERE etablissement_id = ? AND expires_at > ?')
        .get(etablissementId, Date.now()) as { web_search: number; set_by_email: string | null } | undefined;
      if (settings) {
        if (!settings.web_search) webSearch = false;
        teacherEmail = settings.set_by_email;
      }
    }

    if (await mayUseServerKeys(clientIp)) {
      usedServerKey = true;
      // Plafond MENSUEL de l'établissement (0 = illimité, mois UTC).
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
      // Quota QUOTIDIEN PAR ÉLÈVE (0 = illimité, jour UTC).
      if (etab && etab.quota_per_student_daily > 0) {
        if (studentDayUsage(etab.id, studentBucket) >= etab.quota_per_student_daily) {
          return res.status(429).json({ error: { code: 'ERR_QUOTA_ELEVE' } });
        }
      }
      apiKey = String(developerKeys[provider] || "").trim();
      if (!apiKey) return res.status(503).json({ error: { code: ERR.NO_KEY } });
    } else if (isProviderId(FreeProvider) && String(developerKeys[FreeProvider as ProviderId] || "").trim()) {
      // Repli gratuit public : on IMPOSE le fournisseur et le modèle gratuits,
      // quel que soit le choix du client (qui n'a pas fourni de clé).
      usedFreeKey = true;
      effProvider = FreeProvider as ProviderId;
      effModel = (FreeModel || providerDefaults[effProvider].model).slice(0, 128);
      webSearch = false; // le petit modèle gratuit ne fait pas de recherche web
      apiKey = String(developerKeys[effProvider] || "").trim();
    } else {
      return res.status(401).json({ error: { code: ERR.LOCKED } });
    }
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
    // Repli gratuit : CASCADE de secours. On tente chaque modèle gratuit de la
    // liste dans l'ordre ; si l'un est saturé (429 « rate-limited upstream »), on
    // passe au suivant. Un seul modèle configuré → 2 tentatives (429 souvent
    // transitoire). Les autres chemins (BYOK / clé interne) : un seul modèle.
    const freeList = FreeModels.length ? FreeModels : [effModel];
    const candidates = usedFreeKey
      ? (freeList.length === 1 ? [freeList[0], freeList[0]] : freeList).slice(0, 6)
      : [effModel];
    let lastError: any = null;
    for (let ci = 0; ci < candidates.length; ci++) {
     effModel = candidates[ci].slice(0, 128);
     try {
    if (effProvider === "openai" || effProvider === "grok") {
      data = await requestJson(effProvider === "openai" ? "https://api.openai.com/v1/responses" : "https://api.x.ai/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effModel,
          input: withSystem,
          reasoning: { effort: reasoning },
          ...(webSearch ? { tools: [{ type: effProvider === "openai" ? "web_search_preview" : "web_search" }] } : {}),
        }),
      });
    } else if (effProvider === "anthropic") {
      const budgets: Record<ReasoningLevel, number> = { low: 1024, medium: 4096, high: 8192 };
      data = await requestJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "web-search-2025-03-05", "content-type": "application/json" },
        body: JSON.stringify({
          model: effModel, messages: cleanMessages, max_tokens: Math.max(4096, budgets[reasoning] + 2048),
          ...(system ? { system } : {}),
          thinking: { type: "enabled", budget_tokens: budgets[reasoning] },
          ...(webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search" }] } : {}),
        }),
      });
    } else if (effProvider === "gemini") {
      data = await requestJson("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effModel, input: withSystem,
          ...(webSearch ? { tools: [{ type: "google_search" }] } : {}),
          reasoning: { effort: reasoning },
        }),
      });
    } else if (effProvider === "openrouter") {
      data = await requestJson("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
          "HTTP-Referer": "https://educh.at", "X-Title": "EduChat", // attribution recommandée par OpenRouter
        },
        body: JSON.stringify({
          model: effModel, messages: withSystem, max_tokens: 2048,
          // Pas de « reasoning » sur le repli gratuit : le petit modèle Gemma ne
          // raisonne pas et le paramètre est inutile (voire mal supporté).
          ...(usedFreeKey ? {} : { reasoning: { effort: reasoning } }),
          ...(webSearch ? { tools: [{ type: "openrouter:web_search" }] } : {}),
        }),
      });
    } else {
      data = await requestJson("https://api.mistral.ai/v1/conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: effModel, inputs: withSystem,
          ...(webSearch ? { tools: [{ type: "web_search" }] } : {}),
          completion_args: { temperature: reasoning === "low" ? 0.2 : 0.5 },
        }),
      });
    }
        lastError = null;
        break;
     } catch (err) {
       lastError = err;
       // Modèle suivant de la cascade (petite pause pour laisser le pool respirer).
       if (ci < candidates.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
     }
    }
    if (lastError) throw lastError;

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
          // Clé interne : journalisée AVEC l'IP d'établissement (facturation).
          db.prepare(`
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, used_server_key, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `).run(Date.now(), clientIp, etablissementId, teacherEmail, promptRow?.id ?? null, effProvider, effModel, tokenUsage, studentBucket);
        } else if (usedFreeKey) {
          // Clé gratuite publique : journalisée SANS IP ni établissement (suivi
          // du budget gratuit uniquement, aucune donnée personnelle).
          db.prepare(`
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, used_server_key, client_id)
            VALUES (?, '', NULL, NULL, ?, ?, ?, ?, 1, '')
          `).run(Date.now(), promptRow?.id ?? null, effProvider, effModel, tokenUsage);
        }
      })();
    } catch (statsError) {
      console.error('Statistiques non enregistrées :', statsError);
      // La réponse de chat n'est jamais sacrifiée pour une statistique.
    }

    return res.status(200).json({
      reply: textFromResponse(data),
      tokenUsage,
      provider: effProvider,
      free: usedFreeKey,
      ...(promptRow ? { promptName: promptRow.name, promptVersion: promptVersion > 0 ? promptVersion : promptRow.version } : {}),
    });
  } catch (error: any) {
    console.error(`Erreur du fournisseur ${effProvider} :`, error?.message);
    // Repli gratuit saturé (429 upstream) : code dédié, invitant à réessayer ou
    // à saisir une clé personnelle. Sinon, erreur amont générique.
    return usedFreeKey
      ? res.status(503).json({ error: { code: 'ERR_FREE_BUSY' } })
      : res.status(502).json({ error: { code: ERR.UPSTREAM } });
  }
}
