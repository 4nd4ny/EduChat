import type { NextApiRequest, NextApiResponse } from "next";
import { getClientIp, isRateLimited, mayUseServerKeys } from "../../server/access";
import { getDb, PromptRow } from "../../server/db";
import { requireAuth } from "../../server/token";
import { getLadder } from "../../server/ladder";
import { RUNG_REASONING, isRung, modelForRung } from "../../shared/ladder";
import { readUserKey } from "../../server/userKeys";
import { getPublishedByName, getByShareToken } from "../../server/prompts";
import { resolveEtablissementByIp, studentDayUsage } from "../../server/etablissements";
import { notifyAdmin } from "../../server/mail";
import { touchPresence } from "../../server/stats";
import { AlertIpDailyTokens, DeveloperKeys, FreeProvider, FreeModel, FreeModels } from "../../utils/env";
import {
  buildProviderRequest, canStreamProvider, streamProviderResponse,
  type ProviderCallOpts, type WireMessage,
} from "../../server/llm";
import {
  ATTACHMENT_MEDIA_TYPES,
  ERR,
  isProviderId,
  isReasoningLevel,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  providerAcceptsAttachment,
  providerDefaults,
  type Attachment,
  type ProviderId,
  type ReasoningLevel,
} from "../../shared/providers";

type Message = { role: "user" | "assistant"; content: string };

// Runtime Node (et non edge) : indispensable pour lire auth_lock.json et la
// base SQLite avant de dépenser les clés du serveur.
// Limite relevée pour les pièces jointes (images/PDF en base64, BYOK) ; les
// requêtes sans pièce jointe restent minuscules et le contrôle d'accès
// s'applique avant tout appel amont.
export const config = {
  api: { bodyParser: { sizeLimit: "48mb" } },
};

// Clés serveur : définies dans utils/env (partagées avec le compteur public,
// qui doit savoir si le repli gratuit est réellement servi).
const developerKeys = DeveloperKeys as Record<ProviderId, string | undefined>;

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
  // BARREAU de l'échelle (1 = le plus économe). C'est le nouveau réglage :
  // le client n'a plus à nommer un modèle, il demande un niveau. « Régénérer »
  // monte d'un cran, et la facture ne grimpe que si la réponse n'a pas convenu.
  const rung: number = isRung(body.rung) ? body.rung : 1;
  // L'effort suit le barreau, sauf demande explicite (le duel, lui, choisit).
  const reasoning: ReasoningLevel = isReasoningLevel(body.reasoning)
    ? body.reasoning
    : RUNG_REASONING[rung as 1 | 2 | 3];
  const promptName = String(body.promptName ?? "").slice(0, 64);
  const promptVersion = Number.isInteger(body.promptVersion) ? Number(body.promptVersion) : 0;
  const shareToken = String(body.shareToken ?? "").slice(0, 64);
  // Streaming demandé par le client. Il n'est JAMAIS appliqué au repli gratuit
  // (exigence produit : le mode gratuit reste en texte simple) ni à Gemini
  // (API sans flux stable) — dans ces cas la réponse repasse en JSON complet.
  const wantStream = body.stream === true;
  // Identifiant ANONYME de navigateur (uuid aléatoire côté client) : support du
  // quota quotidien par élève — pseudonyme, jamais relié à une identité.
  const clientId = /^[a-f0-9-]{8,64}$/i.test(String(body.clientId ?? "")) ? String(body.clientId) : "";

  if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { code: ERR.EMPTY } });
  }

  // Modes DUALS (comparaison de tuteurs ou de modèles) : réservés aux
  // promptagogues vérifiés — rôle relu en base, jamais dans le jeton.
  if (body.dual === true) {
    const auth = requireAuth(req);
    const promptagogue = auth && (getDb().prepare(
      'SELECT is_promptagogue FROM users WHERE email = ? AND verified_at IS NOT NULL')
      .get(auth.email) as { is_promptagogue: number } | undefined)?.is_promptagogue;
    if (!promptagogue) return res.status(403).json({ error: { code: 'ERR_PROMPTAGOGUE_ONLY' } });
  }

  // Modèle : celui que le client nomme (promptagogues, duel), sinon le barreau
  // demandé de l'échelle réglée par l'administration.
  const model = String(body.model || modelForRung(getLadder(provider), rung, provider)).trim();
  if (!model || model.length > 128) return res.status(400).json({ error: { code: ERR.MODEL } });

  // Clé PERSONNELLE : celle saisie dans la page, ou — à défaut — celle que le
  // titulaire du compte a demandé de mémoriser (chiffrée en base). Résolue ici,
  // avant tout contrôle, pour que la suite ne fasse plus la différence : une
  // clé mémorisée donne exactement les mêmes droits qu'une clé saisie.
  let personalKey = String(body.apiKey || "").trim();
  if (!personalKey) {
    const account = requireAuth(req);
    if (account) personalKey = readUserKey(account.email, provider) ?? "";
  }

  // Pièces jointes (images/PDF) — réservées à la clé PERSONNELLE et aux
  // fournisseurs compatibles. Validation stricte : type MIME en liste blanche,
  // base64 plausible, tailles bornées.
  const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (rawAttachments.length > MAX_ATTACHMENTS) {
    return res.status(400).json({ error: { code: ERR.ATTACH_INVALID } });
  }
  const attachments: Attachment[] = [];
  for (const raw of rawAttachments) {
    const kind: Attachment['kind'] | null = raw?.kind === 'image' || raw?.kind === 'pdf' ? raw.kind : null;
    const mediaType = String(raw?.mediaType ?? '');
    const data = String(raw?.data ?? '');
    const name = String(raw?.name ?? '').slice(0, 128);
    if (!kind || !ATTACHMENT_MEDIA_TYPES[kind].includes(mediaType)) {
      return res.status(400).json({ error: { code: ERR.ATTACH_INVALID } });
    }
    // Longueur base64 ≈ 4/3 de l'original ; contrôle du format sur un échantillon.
    if (!data || data.length > MAX_ATTACHMENT_BYTES * 4 / 3 + 4 || /[^A-Za-z0-9+/=]/.test(data.slice(0, 4096))) {
      return res.status(400).json({ error: { code: ERR.ATTACH_INVALID } });
    }
    attachments.push({ kind, mediaType, name, data });
  }
  if (attachments.length) {
    if (!personalKey) {
      return res.status(403).json({ error: { code: ERR.ATTACH_KEY } });
    }
    if (attachments.some(a => !providerAcceptsAttachment(provider, a.kind))) {
      return res.status(400).json({ error: { code: ERR.ATTACH_UNSUPPORTED } });
    }
  }

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
      // La clé INTERNE d'un établissement ne finance jamais un fournisseur
      // à drapeau rouge : ce serait envoyer des travaux d'élèves hors UE
      // sans cadre de transfert. Ces fournisseurs restent accessibles en
      // clé personnelle, sous la responsabilité de leur titulaire.
      // AI Act : ni les fournisseurs à drapeau rouge, ni ceux réservés aux
      // adultes ne passent par la clé d'un établissement — c'est un public
      // scolaire, donc mineur par défaut.
      if (providerDefaults[provider].wrng || providerDefaults[provider].adultOnly) {
        return res.status(403).json({ error: { code: 'ERR_PROVIDER_NOT_ALLOWED' } });
      }
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
  const withSystem: WireMessage[] = system
    ? [{ role: "system", content: system }, ...cleanMessages]
    : cleanMessages;

  const callOpts = (modelName: string, stream: boolean): ProviderCallOpts => ({
    provider: effProvider, model: modelName, apiKey,
    messages: cleanMessages, withSystem, system,
    reasoning, webSearch, freeMode: usedFreeKey, stream,
    // Pièces jointes : déjà validées, et par construction BYOK uniquement
    // (donc jamais transmises au repli gratuit ni à la clé interne).
    ...(attachments.length && personalKey ? { attachments } : {}),
  });

  // Statistiques — uniquement après une complétion RÉUSSIE : compteurs publics
  // du tuteur + journal de consommation. Le journal ne porte l'IP que pour la
  // clé INTERNE (donnée de facturation d'un établissement scolaire) — jamais
  // pour les clés personnelles.
  const recordStats = (tokenUsage: number) => {
    // Présence anonyme : alimente le compteur « en ligne » de l'accueil, tous
    // modes confondus (clé personnelle comprise). Empreinte non réversible.
    touchPresence(clientId, clientIp);
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

    // Alerte « IP gourmande » : si cette IP dépasse le seuil quotidien de
    // tokens sur la CLÉ INTERNE, l'administration reçoit UN email (par IP et
    // par jour — déduplication en base). Simple visibilité, aucun blocage :
    // les quotas d'établissement restent les garde-fous.
    if (usedServerKey && AlertIpDailyTokens > 0) {
      try {
        const db = getDb();
        const now = new Date();
        const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const used = (db.prepare(
          'SELECT COALESCE(SUM(tokens), 0) AS total FROM usage_log WHERE ip = ? AND used_server_key = 1 AND ts >= ?')
          .get(clientIp, dayStart) as { total: number }).total;
        if (used >= AlertIpDailyTokens) {
          const dayKey = `ipusage:${clientIp}:${now.toISOString().slice(0, 10)}`;
          const inserted = db.prepare('INSERT OR IGNORE INTO admin_alerts (key, ts) VALUES (?, ?)')
            .run(dayKey, Date.now());
          if (inserted.changes > 0) {
            const etabName = etablissementId
              ? (db.prepare('SELECT name FROM etablissements WHERE id = ?').get(etablissementId) as { name: string } | undefined)?.name
              : null;
            notifyAdmin(
              `Usage intensif de la clé interne — ${etabName ?? clientIp}`,
              `L'IP ${clientIp}${etabName ? ` (établissement « ${etabName} »)` : ' (aucun établissement rattaché)'} ` +
              `a consommé ${used.toLocaleString('fr-CH')} tokens sur la clé interne aujourd'hui ` +
              `(seuil d'alerte : ${AlertIpDailyTokens.toLocaleString('fr-CH')}).\n` +
              `Aucun blocage appliqué — ce message est purement informatif (une alerte par IP et par jour).`,
            );
          }
        }
      } catch (alertError) {
        console.error("Alerte d'usage non évaluée :", alertError);
      }
    }
  };

  // ---- Chemin STREAMÉ (clé personnelle ou clé interne, fournisseur capable) --
  if (wantStream && !usedFreeKey && canStreamProvider(effProvider)) {
    // NDJSON : une ligne = un événement {type: start|delta|done|error}.
    // X-Accel-Buffering désactive la mise en tampon du reverse proxy (NPM/nginx),
    // sans quoi le flux arriverait d'un bloc.
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    const emit = (event: Record<string, unknown>) => { res.write(JSON.stringify(event) + '\n'); };
    emit({
      type: 'start', provider: effProvider, free: false,
      ...(promptRow ? { promptName: promptRow.name, promptVersion: promptVersion > 0 ? promptVersion : promptRow.version } : {}),
    });

    let emitted = false;
    try {
      let text = '';
      let tokens = 0;
      try {
        const result = await streamProviderResponse(callOpts(effModel, true), fragment => {
          emitted = true;
          emit({ type: 'delta', text: fragment });
        });
        text = result.text; tokens = result.tokens;
        // Certains fournisseurs (dialecte OpenAI minimal) n'envoient aucun
        // décompte dans le flux : estimation prudente à ~4 caractères par
        // token, pour que les compteurs publics ne restent pas à zéro.
        if (!tokens && text) tokens = Math.max(1, Math.round(text.length / 4));
      } catch (streamError) {
        // Rien n'est encore parti vers le client : une seconde chance en réponse
        // complète (certains modèles/passerelles refusent le flux).
        if (emitted) throw streamError;
        const { url, init } = buildProviderRequest(callOpts(effModel, false));
        const data = await requestJson(url, init);
        text = textFromResponse(data);
        tokens = usageFromResponse(data);
        emit({ type: 'delta', text });
      }
      recordStats(tokens);
      emit({ type: 'done', tokenUsage: tokens });
    } catch (error: any) {
      console.error(`Erreur du fournisseur ${effProvider} (flux) :`, error?.message);
      emit({ type: 'error', code: ERR.UPSTREAM });
    }
    return res.end();
  }

  // ---- Chemin NON STREAMÉ (repli gratuit, Gemini, ou client sans stream) -----
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
        const { url, init } = buildProviderRequest(callOpts(effModel, false));
        data = await requestJson(url, init);
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
    recordStats(tokenUsage);

    return res.status(200).json({
      reply: textFromResponse(data),
      tokenUsage,
      provider: effProvider,
      // Le modèle réellement appelé : l'apprenant ne le choisit plus, il doit
      // au moins pouvoir savoir ce qui a répondu (et l'administration vérifier
      // que l'échelle fait ce qu'elle annonce).
      model: effModel,
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
