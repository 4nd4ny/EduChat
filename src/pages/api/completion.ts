import type { NextApiRequest, NextApiResponse } from "next";
import { getClientIp, isRateLimited, mayUseServerKeys } from "../../server/access";
import { getDb, PromptRow } from "../../server/db";
import { requireAuth } from "../../server/token";
import { getLadder } from "../../server/ladder";
import { aUnMoyenPropre, fournisseurLibre, perimetreFournisseurs } from "../../server/accesFournisseurs";
import { RUNG_REASONING, isRung, modelForRung } from "../../shared/ladder";
import { tokensDetail } from "../../server/llm";
import { readUserKey } from "../../server/userKeys";
import { getPublishedByName, getByShareToken, porteeAppelant, PorteeCatalogue } from "../../server/prompts";
import { traductionFraiche } from "../../server/traduction";
import { resolveEtablissementByIp, studentDayUsage } from "../../server/etablissements";
import { seanceActive, seanceAutoriseFournisseur } from "../../server/seance";
import { aDuCredit, aUnPorteMonnaie, decompter, titulaireCompte, titulaireEcole }
  from "../../server/porteMonnaie";
import { notifyAdmin } from "../../server/mail";
import { touchPresence } from "../../server/stats";
import { AlertIpDailyTokens, DeveloperKeys, FreeModel, FreeModels } from "../../utils/env";
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

/**
 * Entrée et sortie, séparées. Elles n'ont pas le même prix — un jeton de
 * sortie en vaut cinq chez Anthropic comme chez Mistral — et les fournisseurs
 * les renvoient distinctement. Les additionner obligeait à deviner un rapport
 * pour facturer ; il n'y a rien à deviner, il suffit de ne plus jeter.
 */
function detailFromResponse(data: any): { entree: number; sortie: number } {
  return tokensDetail(data?.usage ?? {});
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
function resolveSystemPrompt(promptName: string, promptVersion: number, shareToken: string, locale: string,
  portee: PorteeCatalogue):
  { row: PromptRow; system: string } | 'unknown' | null {
  if (shareToken) {
    // Brouillon en cours d'écriture : on sert le texte de l'auteur, jamais une
    // traduction. Il teste ce qu'il vient d'écrire.
    const row = getByShareToken(shareToken);
    if (!row) return 'unknown';
    return { row, system: row.body };
  }
  if (!promptName) return null;
  // PORTÉE : le tuteur doit être VISIBLE de l'appelant, pas seulement publié.
  // C'est ici que se joue vraiment la propriété d'un tuteur par son école :
  // filtrer le catalogue et la fiche sans filtrer la complétion laisserait le
  // tuteur d'une autre école introuvable… mais parfaitement UTILISABLE dès
  // qu'on en devine le nom.
  const row = getPublishedByName(promptName, portee);
  if (!row) return 'unknown';
  if (promptVersion > 0 && promptVersion !== row.version) {
    // Conversation restée sur une version antérieure : elle garde SON texte.
    // Les traductions ne sont conservées que pour la version courante — servir
    // celle d'une autre version reviendrait à changer le tuteur en cours de route.
    const old = getDb().prepare('SELECT body FROM prompt_versions WHERE prompt_id = ? AND version = ?')
      .get(row.id, promptVersion) as { body: string } | undefined;
    if (old) return { row, system: old.body };
  }
  // C'EST ICI que la traduction sert vraiment. Un tuteur écrit en français
  // fait répondre le modèle en français, quelle que soit la langue du site :
  // traduire l'interface sans traduire le prompt système ne trompait personne.
  const traduit = traductionFraiche(row.id, row.version, locale);
  return { row, system: traduit?.body ?? row.body };
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
  // clé mémorisée donne exactement les mêmes droits qu'une clé saisie POUR
  // PAYER. Pour OUVRIR un périmètre, en revanche, les deux ne se valent pas —
  // voir juste en dessous.
  const compteAppelant = requireAuth(req)?.email ?? null;
  let personalKey = String(body.apiKey || "").trim();
  if (!personalKey && compteAppelant) personalKey = readUserKey(compteAppelant, provider) ?? "";

  // ─── LE PÉRIMÈTRE : QUELS FOURNISSEURS POUR CETTE REQUÊTE-CI ───────────────
  //
  // Une seule fonction, la même que celle qui dresse la liste affichée
  // (/api/providers) : src/server/accesFournisseurs.ts, où la matrice est
  // écrite et démontrée. LE CONTRÔLE VIT ICI, pas dans le menu déroulant —
  // une requête forgée à la main n'a aucune interface à contourner.
  //
  // `moyenPropre` se lit EN BASE (aUnMoyenPropre), jamais dans le corps de la
  // requête : sur le réseau d'une école, seul un moyen de paiement associé
  // AVANT de venir lève les règles de l'établissement. Accepter la clé collée
  // dans le champ reviendrait à rouvrir Grok en classe pour qui a trouvé une
  // clé sur un forum — et cette route serait alors plus permissive que la
  // liste, qui, elle, ne voit pas le corps de la requête.
  const perimetre = perimetreFournisseurs({
    ip: clientIp, email: compteAppelant, moyenPropre: aUnMoyenPropre(compteAppelant),
  });

  // OÙ LE PÉRIMÈTRE MORD, ET OÙ IL SERAIT REDONDANT.
  //
  // Il mord sur le chemin qui honore RÉELLEMENT le fournisseur demandé : celui
  // d'une clé personnelle. C'est là, et là seulement, que le choix du client
  // décide de qui reçoit la conversation.
  //
  // Les deux autres chemins portent leur propre garde, et elle est plus
  // stricte :
  //   · la clé INTERNE refuse tout net les fournisseurs écartés et les drapeaux
  //     rouges (plus bas) — l'engagement pris devant une école ne dépend donc
  //     pas de ce test-ci —, et elle ne s'ouvre PAS à un anonyme hors campus
  //     (garde `motif !== 'demo'`, plus bas, où le cas est démonté) ;
  //   · le repli gratuit IMPOSE son fournisseur et son modèle : le choix du
  //     client y est ignoré, il n'y a rien à refuser.
  // Refuser ICI, en plus, fermerait la porte au visiteur anonyme qui garde
  // « Claude » dans son menu et reçoit aujourd'hui, comme hier, la réponse du
  // modèle gratuit — un refus sec là où il y a une réponse à donner. On ne
  // casse pas la démonstration publique pour un contrôle que la suite du
  // fichier fait déjà, et mieux.
  if (personalKey && !perimetre.fournisseurs.includes(provider)) {
    return res.status(403).json({
      error: {
        code: perimetre.motif === 'ecole'
          ? 'ERR_PROVIDER_SCHOOL_NETWORK'     // le lieu : aucun réglage de l'intéressé ne le lève
          : 'ERR_PROVIDER_ACCOUNT_REQUIRED',  // la démonstration : il faut un compte
      },
    });
  }

  // OPENROUTER : LE SEUL FOURNISSEUR À DEUX STATUTS, ET VOICI CE QUI LE TIENT.
  //
  // Il n'est pas « écarté », parce que dans le chat personne ne choisit de
  // modèle : l'administration règle l'échelle, aujourd'hui Mistral et Claude,
  // et OpenRouter n'est qu'un intermédiaire vers des modèles conformes — il est
  // même le moteur du repli gratuit public. Son drapeau WRNG suffit donc à le
  // signaler, sans l'écarter.
  //
  // Mais cette promesse ne vaut QUE tant que le modèle vient de l'échelle.
  // Nommer « deepseek/… » à travers OpenRouter atteindrait, en une ligne de
  // requête, ce qu'aucune de nos listes ne contient. NOMMER SON MODÈLE CHEZ UN
  // INTERMÉDIAIRE DEMANDE DONC UN COMPTE : quelqu'un d'identifié, qui paie et
  // répond de son appel. L'anonyme, lui, n'a d'OpenRouter que le repli gratuit,
  // dont le modèle est imposé — et c'est précisément par là qu'il essaierait de
  // passer. La page « duel » ne le lui propose plus ; ceci le refuse aussi à
  // une requête forgée à la main, qui n'a pas d'interface à contourner.
  if (provider === 'openrouter' && body.model && !getLadder('openrouter').includes(model)
      && !perimetre.compte) {
    return res.status(403).json({ error: { code: 'ERR_PROVIDER_ACCOUNT_REQUIRED' } });
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
  // Langue de lecture, envoyée par le client (router.locale) : le routage i18n
  // de Next ne traverse pas les routes d'API.
  const locale = String(body.locale ?? "").slice(0, 5);
  // PORTÉE DE LECTURE, ET RIEN QUE DE LECTURE : quels tuteurs cet appelant a le
  // droit d'employer. Elle suit l'ÉCOLE du compte quand il y a un titre
  // d'enseignement (porteeAppelant, src/server/prompts.ts), sans quoi un
  // enseignant qui essaie chez lui, avec sa propre clé, le tuteur réservé de son
  // collège recevrait un 404 sur un texte qu'il a lui-même écrit.
  //
  // CELA NE DÉPLACE AUCUN FRANC. Qui paie se décide plus bas, sur la seule IP
  // (resolveEtablissementByIp puis mayUseServerKeys) : lire le tuteur de son
  // école depuis la maison ne fait pas de la maison un réseau scolaire.
  const resolved = resolveSystemPrompt(promptName, promptVersion, shareToken, locale,
    porteeAppelant(req, clientIp));
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
  //     du fournisseur choisi, soumise aux quotas (facturée, journalisée avec l'IP).
  //     JAMAIS pour un anonyme hors campus : voir la garde, plus bas ;
  //  3. PORTE-MONNAIE PERSONNEL → clé interne, décomptée sur le crédit du
  //     compte. Journalisée SANS IP ni établissement : la consommation d'une
  //     personne n'est la donnée d'aucune école ;
  //  4. REPLI GRATUIT public → fournisseur + modèle gratuits configurés
  //     (SECRET_FREE_PROVIDER / SECRET_FREE_MODEL), avec la clé serveur de ce
  //     fournisseur : le site « marche un peu » sans rien saisir. JAMAIS journalisé
  //     avec l'IP (pas d'établissement, pas de donnée personnelle) ;
  //  5. sinon → verrouillé (401).
  //
  // L'ORDRE 2 AVANT 3 EST UNE DÉCISION D'ARGENT, PAS UN HASARD. Là où l'école
  // finance déjà (son réseau, ses horaires, son porte-monnaie), elle continue
  // de payer : déplacer silencieusement la dépense sur le crédit d'un élève
  // parce qu'il en a un serait lui faire payer le cours. De même quand le site
  // est GLOBALEMENT déverrouillé (verrou /api/auth) : la plateforme offre alors
  // le service à tout le monde, et on ne prélève pas un crédit personnel pour
  // ce qu'on donne au même instant à l'anonyme d'à côté.
  let apiKey = personalKey;
  let effProvider: ProviderId = provider;   // fournisseur RÉELLEMENT utilisé
  let effModel = model;                      // modèle RÉELLEMENT utilisé
  let usedServerKey = false;                 // clé interne (établissement/déverrouillé) → journal + IP
  let usedFreeKey = false;                   // clé gratuite publique → journal sans IP
  let payeurCompte: string | null = null;    // clé interne payée par un crédit PERSONNEL
  let etablissementId: number | null = null;
  let studentBucket = "";
  let teacherEmail: string | null = null;

  if (!personalKey) {
    // Le repli gratuit, résolu UNE fois : la même fonction que celle qui dresse
    // la liste de la démonstration, refus des fournisseurs écartés compris.
    const libre = fournisseurLibre();
    const etab = resolveEtablissementByIp(clientIp);
    etablissementId = etab?.id ?? null;
    // Pot du quota par élève : clientId anonyme si valide, SINON l'IP — omettre
    // ou trafiquer le clientId rejoint le pot commun de l'IP, sans annuler le quota.
    studentBucket = etab ? (clientId || `ip:${clientIp}`) : "";

    // Réglages de séance actifs (étape 14) : override recherche web,
    // attribution enseignant, et liste des fournisseurs autorisés (appliquée
    // plus bas, sur la clé interne uniquement).
    const seance = seanceActive(etablissementId);
    if (seance) {
      if (!seance.webSearch) webSearch = false;
      teacherEmail = seance.setByEmail;
    }

    // ─── LA CLÉ INTERNE N'EST PAS OFFERTE À UN ANONYME HORS CAMPUS ─────────
    //
    // `motif !== 'demo'`, et cette condition n'est pas décorative : sans elle,
    // la route est PLUS PERMISSIVE QUE LA LISTE qu'elle est censée appliquer,
    // et c'est exactement le défaut que accesFournisseurs.ts existe pour
    // supprimer — « c'est toujours la copie la plus permissive qui survit ».
    //
    // LA REQUÊTE FORGÉE, EN UNE LIGNE. Site globalement déverrouillé (verrou
    // /api/auth, posé depuis /school), visiteur sans compte et hors du réseau
    // de toute école, `POST {provider:"anthropic"}` sans clé : mayUseServerKeys
    // répondait `true` sur le seul verrou global, `anthropic` n'est ni écarté
    // ni drapeau rouge, et `etablissementId` étant nul, ni le porte-monnaie ni
    // les quotas ne mordaient. C'était Claude, sur la clé de la plateforme, à
    // un inconnu, sans que rien ne soit décompté à personne. Sa liste, elle,
    // ne contenait que le repli gratuit : l'écran promettait moins que ce que
    // le serveur donnait — l'écart qu'on ne remarque jamais, puisqu'il ne
    // produit aucune erreur.
    //
    // LE MÊME TEST RÉPARE L'INVERSE. La liste d'un anonyme hors campus se
    // réduit désormais au seul fournisseur du repli gratuit, et ChatSettings
    // aligne le menu dessus — or ce fournisseur est OpenRouter, à drapeau
    // rouge, que la branche ci-dessous refuse tout net. Site déverrouillé, ce
    // visiteur ne recevait donc plus RIEN (403) là où il recevait hier la
    // démonstration. Il tombe maintenant sur le repli gratuit, verrou ouvert
    // ou fermé — c'est-à-dire sur ce que la matrice lui promet, et sur la même
    // chose dans les deux états du site.
    //
    // CE QUE CELA COÛTE, ET POURQUOI C'EST LE BON PRIX. Une école
    // mono-établissement qui s'appuierait sur le verrou global SANS avoir
    // déclaré son adresse (ni en base, ni dans SECRET_ALLOWED_IPS) retombe sur
    // le modèle gratuit : `surLeCampus` ne la reconnaît pas. Le remède existe
    // et il est le bon — déclarer l'adresse, ce que la fonction honore déjà —,
    // et une adresse ILLISIBLE compte de toute façon pour une école, si bien
    // qu'un proxy cassé n'enferme personne. Payer la clé de la plateforme pour
    // n'importe qui, au motif qu'une école a oublié de se déclarer, serait
    // l'échange inverse.
    if (perimetre.motif !== 'demo' && await mayUseServerKeys(clientIp)) {
      // La clé INTERNE d'un établissement ne finance jamais un fournisseur
      // à drapeau rouge : ce serait envoyer des travaux d'élèves hors UE
      // sans cadre de transfert. Ces fournisseurs restent accessibles en
      // clé personnelle, sous la responsabilité de leur titulaire.
      // AI Act : ni les fournisseurs à drapeau rouge, ni ceux écartés d'un
      // public scolaire ne passent par la clé d'un établissement — c'est un
      // public scolaire, donc mineur par défaut. CE REFUS NE DÉPEND D'AUCUNE
      // CASE DE LA MATRICE : un compte qui paie lui-même a le droit de choisir
      // ces fournisseurs, jamais celui de les faire payer par une école.
      if (providerDefaults[provider].wrng || providerDefaults[provider].ecarte) {
        return res.status(403).json({ error: { code: 'ERR_PROVIDER_NOT_ALLOWED' } });
      }
      // FOURNISSEURS DE LA SÉANCE. L'enseignant a coché ce que sa classe peut
      // utiliser aujourd'hui : la règle s'applique ICI, sur le serveur, et pas
      // seulement dans le sélecteur — un filtre qui ne vivrait que dans le
      // navigateur n'est pas un filtre. Elle S'AJOUTE aux deux règles ci-dessus
      // (AI Act, drapeau rouge) sans jamais les desserrer, et ne concerne que
      // la clé INTERNE : une clé personnelle relève de son titulaire, pas de la
      // séance (on est déjà dans la branche « aucune clé personnelle »).
      // Placée AVANT le porte-monnaie et les quotas : un refus doit dire sa
      // vraie raison, pas renvoyer la classe vers un crédit qui n'y est pour rien.
      if (!seanceAutoriseFournisseur(seance, provider)) {
        return res.status(403).json({ error: { code: 'ERR_PROVIDER_NOT_IN_SESSION' } });
      }
      usedServerKey = true;
      // Plafond MENSUEL de l'établissement (0 = illimité, mois UTC).
      // PORTE-MONNAIE À SEC : on refuse AVANT d'appeler le fournisseur, sinon
      // l'école paie l'appel qu'on s'apprête à lui refuser. Ici et pas plus
      // haut : hors salle déverrouillée, le visiteur relève du repli gratuit
      // public, qu'un porte-monnaie vide n'a aucune raison de fermer.
      // Code DISTINCT du quota : une classe qui bute sur un mur doit lire
      // « l'école n'a plus de crédit » — « quota dépassé » l'enverrait
      // attendre demain un déblocage qui ne viendra pas tout seul.
      if (etablissementId && !aDuCredit(titulaireEcole(etablissementId))) {
        return res.status(402).json({ error: { code: 'ERR_SCHOOL_NO_CREDIT' } });
      }

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
    } else if (perimetre.compte && compteAppelant && aUnPorteMonnaie(compteAppelant)) {
      // ─── LE PORTE-MONNAIE PERSONNEL ────────────────────────────────────────
      //
      // EduChat vend aussi des jetons à une personne : elle provisionne, elle
      // emploie la clé interne, on décompte son crédit au prix coûtant. Même
      // règle que pour une école, jusqu'au refus AVANT l'appel.
      //
      // POURQUOI « A UN PORTE-MONNAIE » ET NON « A DU CRÉDIT » COMME CONDITION
      // D'ENTRÉE : les deux réponses à un solde vide sont opposées, et il faut
      // savoir laquelle on doit. Qui n'a jamais provisionné doit continuer de
      // recevoir la démonstration gratuite exactement comme avant — ce chantier
      // n'a pas le droit de la lui retirer. Qui a provisionné puis épuisé doit
      // l'APPRENDRE (402) : le rétrograder en silence sur le petit modèle
      // gratuit le laisserait constater que « les réponses sont devenues
      // mauvaises » sans jamais lui dire pourquoi.
      //
      // `perimetre.compte` et non le seul jeton : les droits se relisent en
      // base (voir accesFournisseurs.ts). Un jeton vit quatre-vingt-dix jours et
      // survit à un compte effacé — dont la ligne users, donc le solde, n'existe
      // plus.
      if (!aDuCredit(titulaireCompte(compteAppelant))) {
        return res.status(402).json({ error: { code: 'ERR_ACCOUNT_NO_CREDIT' } });
      }
      // LA CLÉ INTERNE NE SERT JAMAIS UN ÉCARTÉ NI UN DRAPEAU ROUGE, QUEL QUE
      // SOIT LE PAYEUR — même règle, mot pour mot, que pour une école, et pour
      // la même raison : c'est la clé d'EduChat, et l'engagement qu'elle porte
      // ne s'achète pas. Un crédit personnel achète des jetons, pas le droit de
      // faire sortir cette clé de ce qu'elle a promis de servir. Ces
      // fournisseurs-là restent atteignables, mais avec SA PROPRE clé — c'est
      // exactement ce que dit la matrice (accesFournisseurs.ts).
      if (providerDefaults[provider].wrng || providerDefaults[provider].ecarte) {
        return res.status(403).json({ error: { code: 'ERR_PROVIDER_NOT_ALLOWED' } });
      }
      // LES FOURNISSEURS DE LA SÉANCE VALENT AUSSI ICI, et c'est un choix.
      // Hors d'une école le test ne coûte rien (pas d'établissement résolu par
      // l'IP, donc pas de séance, donc `true`). Dedans — cas d'un appel hors des
      // horaires d'accès, où l'école ne paie pas mais où la classe a bien lieu —
      // un crédit personnel n'achète pas le droit de sortir de ce que
      // l'enseignant a coché pour son heure de cours. La restriction est
      // PÉDAGOGIQUE, pas financière : payer soi-même ne change rien à ce qu'on
      // est venu faire dans cette salle. Celui qui l'a posée peut la lever ;
      // personne d'autre.
      if (!seanceAutoriseFournisseur(seance, provider)) {
        return res.status(403).json({ error: { code: 'ERR_PROVIDER_NOT_IN_SESSION' } });
      }
      payeurCompte = compteAppelant;
      apiKey = String(developerKeys[provider] || "").trim();
      if (!apiKey) return res.status(503).json({ error: { code: ERR.NO_KEY } });
    } else if (libre && !perimetre.campus) {
      // LE REPLI GRATUIT NE DESSERT PAS UNE SALLE DE CLASSE, et cette condition
      // `!perimetre.campus` répare un trou mesuré.
      //
      // Le repli est OpenRouter : un intermédiaire à drapeau rouge, servi sur un
      // budget de démonstration. Hors campus c'est exactement ce qu'on veut
      // offrir à un visiteur anonyme. Sur le campus, c'est la rupture de
      // l'engagement pris devant la direction — « chez nous, seuls les
      // fournisseurs conformes ».
      //
      // Le trou ne s'ouvrait pas par la porte du choix de fournisseur, mais par
      // celle de l'HORAIRE : mayUseServerKeys() rend faux hors des heures
      // déclarées par l'établissement, la branche « clé interne » est sautée, et
      // l'élève tombait ici. Mesuré : IP d'école, 15 h 06 hors plage, question
      // anonyme → réponse servie par OpenRouter. La liste annoncée à cet élève
      // par /api/providers disait pourtant « mistral, anthropic, openai ».
      //
      // Refuser est le comportement juste : une école hors horaire, ou à sec,
      // doit voir son accès FERMÉ — ce qui se remarque et s'explique — et non
      // silencieusement dévié vers un fournisseur qu'elle a écarté. Le visiteur
      // reçoit ERR_LOCKED ci-dessous.
      //
      // Repli gratuit public : on IMPOSE le fournisseur et le modèle gratuits,
      // quel que soit le choix du client (qui n'a pas fourni de clé).
      //
      // LE FOURNISSEUR VIENT DE fournisseurLibre() ET NON DE FreeProvider :
      // c'est la MÊME fonction qui dresse la liste de la démonstration
      // (accesFournisseurs.ts), et elle refuse un repli gratuit configuré sur
      // un fournisseur ÉCARTÉ. Écrit deux fois, ce test aurait divergé — et
      // c'est ici, sur le seul chemin où le fournisseur ne vient pas de la
      // requête, que la divergence aurait fait payer par la clé de la
      // plateforme, à un visiteur anonyme de salle de classe, ce qu'aucune
      // autre ligne du fichier n'accepte de payer.
      usedFreeKey = true;
      effProvider = libre;
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
  const recordStats = (tokenUsage: number, detail: { entree: number; sortie: number } = { entree: 0, sortie: 0 }) => {
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
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, tokens_in, tokens_out, used_server_key, client_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
          `).run(Date.now(), clientIp, etablissementId, teacherEmail, promptRow?.id ?? null, effProvider, effModel,
                 tokenUsage, detail.entree, detail.sortie, studentBucket);
          // Décompte du porte-monnaie DANS LA MÊME TRANSACTION que la ligne de
          // journal : séparés, le registre et le solde finiraient par diverger,
          // et plus rien ne se réconcilierait. L'exonération RESPIRE est
          // vérifiée dans decompter, pas ici : une règle de gratuité ne se
          // répète pas à chaque point d'appel.
          if (etablissementId) {
            decompter(titulaireEcole(etablissementId), effProvider, detail.entree, detail.sortie, effModel);
          }
        } else if (payeurCompte) {
          // PORTE-MONNAIE PERSONNEL : journal SANS IP, SANS établissement et
          // SANS teacher_email. La colonne `ip` est documentée comme une donnée
          // de FACTURATION D'ÉTABLISSEMENT, et /rgpd promet qu'on ne journalise
          // pas l'usage d'une personne : y inscrire l'adresse d'un particulier
          // reprendrait cette promesse pour un confort d'exploitation.
          //
          // Le lien avec le titulaire n'est pas perdu pour autant — il vit dans
          // credit_mouvements.titulaire_email, où il est à sa place : le relevé
          // de SON porte-monnaie, qu'il consulte lui-même et qui entre dans son
          // export. Une dépense doit être traçable par celui qui la paie ;
          // c'est autre chose que de tenir un journal de qui parle à quel modèle.
          //
          // used_server_key = 1 dit vrai (la clé interne a bien servi) et suit
          // ce que fait déjà le repli gratuit. L'alerte « IP gourmande », elle,
          // ne se déclenche pas : elle est gardée par la variable usedServerKey,
          // restée fausse, et interroge de toute façon une IP réelle.
          db.prepare(`
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, tokens_in, tokens_out, used_server_key, client_id)
            VALUES (?, '', NULL, NULL, ?, ?, ?, ?, ?, ?, 1, '')
          `).run(Date.now(), promptRow?.id ?? null, effProvider, effModel, tokenUsage, detail.entree, detail.sortie);
          // Décompte dans la MÊME transaction que la ligne de journal, comme
          // pour une école : séparés, le registre et le solde divergent.
          decompter(titulaireCompte(payeurCompte), effProvider, detail.entree, detail.sortie, effModel);
        } else if (usedFreeKey) {
          // Clé gratuite publique : journalisée SANS IP ni établissement (suivi
          // du budget gratuit uniquement, aucune donnée personnelle).
          db.prepare(`
            INSERT INTO usage_log (ts, ip, etablissement_id, teacher_email, prompt_id, provider, model, tokens, tokens_in, tokens_out, used_server_key, client_id)
            VALUES (?, '', NULL, NULL, ?, ?, ?, ?, ?, ?, 1, '')
          `).run(Date.now(), promptRow?.id ?? null, effProvider, effModel, tokenUsage, detail.entree, detail.sortie);
        }
      })();
    } catch (statsError) {
      // DEUX ÉCHECS TRÈS DIFFÉRENTS PASSENT PAR ICI, ET LE JOURNAL DOIT LES
      // DISTINGUER. Une statistique perdue n'est rien. Un DÉCOMPTE perdu est de
      // l'argent : la transaction étant annulée en bloc, la réponse a été
      // servie et personne ne l'a payée. bouger() échoue bruyamment quand un
      // titulaire est introuvable, précisément pour que ce cas se voie — encore
      // faut-il que ce catch-ci ne l'enterre pas sous « statistiques non
      // enregistrées », qui invite à ne pas regarder.
      //
      // L'adresse figure dans le message parce que sans elle la trace est
      // inexploitable : le décompte n'ayant PAS eu lieu, il n'existe aucune
      // ligne de registre où retrouver de qui il s'agissait. C'est un message
      // d'anomalie, pas un journal d'usage.
      if (payeurCompte || etablissementId) {
        console.error(
          'CONSOMMATION NON DÉCOMPTÉE — '
          + (payeurCompte ? `compte ${payeurCompte}` : `établissement ${etablissementId}`)
          + ` · ${effProvider} · ${effModel} · ${detail.entree}+${detail.sortie} jetons :`,
          statsError);
      } else {
        console.error('Statistiques non enregistrées :', statsError);
      }
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
      let detail = { entree: 0, sortie: 0 };
      try {
        const result = await streamProviderResponse(callOpts(effModel, true), fragment => {
          emitted = true;
          emit({ type: 'delta', text: fragment });
        });
        text = result.text; tokens = result.tokens; detail = result.detail;
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
        tokens = usageFromResponse(data); detail = detailFromResponse(data);
        emit({ type: 'delta', text });
      }
      recordStats(tokens, detail);
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
    recordStats(tokenUsage, detailFromResponse(data));

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
