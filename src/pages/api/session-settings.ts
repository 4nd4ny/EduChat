import { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '../../server/db';
import { getClientIp, getAuthLockExpiry, isRateLimited } from '../../server/access';
import { requireAuth } from '../../server/token';
import {
  choixEcole, ecoleActivePourCompte, estAdminDe, estEnseignantDe,
} from '../../server/appartenance';
import { DeveloperKeys, MaxUnlockMinutes } from '../../utils/env';
import { ERR, isProviderId, SCHOOL_PROVIDER_IDS, type ProviderId } from '../../shared/providers';
import { resolveEtablissementByIp } from '../../server/etablissements';
import { CLAUSE_VISIBLE, getPublishedByName, parametresPortee, porteeDeLEcole } from '../../server/prompts';
import { parseFournisseursSeance, seanceRestreinte, SEANCE_SANS_FOURNISSEUR } from '../../server/seance';

// Réglages de session posés par l'enseignant au déverrouillage (étape 14) :
// tuteur par défaut, recherche web on/off et FOURNISSEURS AUTORISÉS pour les
// élèves de SON établissement (résolu par IP). Tout expire avec le verrou de
// la salle.
//
// « Déployer sur une classe » (pivot v3), concrètement : le prof choisit le
// tuteur, tous les élèves de l'IP le reçoivent pré-sélectionné.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const ip = getClientIp(req);
  const etablissementId = resolveEtablissementByIp(ip)?.id ?? null;

  // ---- GET : les réglages ACTIFS de l'établissement de l'appelant -----------
  // Public (les élèves en héritent), sans aucune donnée personnelle.
  if (req.method === 'GET') {
    if (!etablissementId) return res.status(200).json({ settings: null });
    // LA MÊME PORTÉE QU'AU CATALOGUE, et pas seulement « publié ». La séance
    // est posée sous contrôle (PUT plus bas), mais elle DURE : entre-temps
    // l'autre école peut reprendre son tuteur (« reserver »), ou celle-ci
    // refermer son catalogue. Sans ce filtre, le nom d'un tuteur devenu
    // invisible continuerait d'arriver aux élèves — annoncé par la séance,
    // puis refusé par la complétion. Le LEFT JOIN rend alors promptName NULL,
    // c'est-à-dire « aucun tuteur imposé » : la classe retombe sur le
    // catalogue, elle ne tombe pas en panne.
    const row = getDb().prepare(`
      SELECT s.default_prompt_id AS promptId, s.web_search AS webSearch, s.expires_at AS expiresAt,
             s.providers AS providers, p.name AS promptName
      FROM session_settings s
      LEFT JOIN prompts p ON p.id = s.default_prompt_id AND ${CLAUSE_VISIBLE}
      WHERE s.etablissement_id = @etabId AND s.expires_at > @now
    `).get({
      etabId: etablissementId, now: Date.now(),
      ...parametresPortee(porteeDeLEcole(etablissementId)),
    }) as
      { promptName: string | null; webSearch: number; providers: string; expiresAt: number } | undefined;
    return res.status(200).json({
      settings: row ? {
        promptName: row.promptName, webSearch: !!row.webSearch, expiresAt: row.expiresAt,
        // Les deux vont ENSEMBLE : la liste seule est ambiguë, puisqu'une liste
        // vide se lit « tous » si aucune restriction n'a été posée, et « aucun »
        // si l'enseignant a tout décoché. Le drapeau tranche.
        providers: parseFournisseursSeance(row.providers),
        providersRestricted: seanceRestreinte(row.providers),
      } : null,
    });
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  if (await isRateLimited(ip, 10, 'session-settings')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  // Écriture : dans la foulée d'un déverrouillage (le mot de passe de salle EST
  // la preuve enseignante — modèle de confiance de la classe), ou avec un
  // compte enseignant vérifié (rôle ET rattachement relus en base).
  const auth = requireAuth(req);
  const lockExpiry = await getAuthLockExpiry();
  let teacherEtabId: number | null = null;
  if (auth) {
    // L'ÉCOLE ACTIVE et non plus users.etablissement_id : un enseignant
    // partagé entre deux collèges pose la séance de celui qu'il a choisi, et
    // le serveur revérifie ce choix contre la table de liaison.
    const active = ecoleActivePourCompte(auth.email, choixEcole(req));
    // « users.is_teacher » NE SUFFIT PAS, et le lien d'appartenance non plus.
    //
    // is_teacher se DÉCLARE (case « je suis enseignant » de /verifier), et le
    // lien se RAMASSE en vérifiant son adresse depuis une IP d'établissement
    // (verify/confirm.ts) — élèves compris. « Case cochée + wifi du collège »
    // aurait donc suffi à poser la séance de toute l'école, DEPUIS CHEZ SOI et
    // hors de toute heure de classe : le tuteur déployé sur les écrans, les
    // fournisseurs du jour restreints ou rouverts. La séance est une décision
    // d'enseignant ; on exige donc les mêmes deux titres que /api/etablissement
    // et requireGestionTuteurs — administrer cette école, ou en être
    // l'enseignant AU SENS OÙ ELLE EN RÉPOND (estEnseignantDe : école
    // principale, c'est-à-dire un rattachement posé par une administration).
    //
    // Le chemin sans compte n'est pas touché : le mot de passe de salle reste
    // la preuve enseignante de la classe, et il vise l'école de l'IP.
    if (active !== null && (estAdminDe(auth.email, active) || estEnseignantDe(auth.email, active))) {
      teacherEtabId = active;
    }
  }
  if (!lockExpiry && teacherEtabId === null) {
    return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
  }
  // La CIBLE de l'écriture est l'établissement DU PROF (son rattachement, relu
  // en base) — jamais l'IP seule : un prof ne peut donc pas, en forgeant une IP,
  // pousser des réglages à une autre école. Le déverrouillage par mot de passe
  // (sans compte), lui, agit sur l'établissement de l'IP de la salle.
  const targetEtabId = teacherEtabId ?? etablissementId;
  if (!targetEtabId) {
    return res.status(400).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });
  }

  const promptName = String(req.body?.promptName ?? '').slice(0, 64);
  const webSearch = req.body?.webSearch ? 1 : 0;
  let promptId: number | null = null;
  if (promptName) {
    // Le tuteur doit être VISIBLE de l'école pour laquelle on pose la séance —
    // pas seulement publié. Sans cette portée, un enseignant pourrait déployer
    // sur sa classe un tuteur réservé à une autre école : le réglage
    // s'enregistrerait, et la complétion le refuserait ensuite aux élèves.
    const prompt = getPublishedByName(promptName, porteeDeLEcole(targetEtabId));
    if (!prompt) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
    promptId = prompt.id;
  }

  // FOURNISSEURS AUTORISÉS. Liste blanche stricte : on ne retient que ce
  // qu'une clé d'école a le droit de servir (SCHOOL_PROVIDER_IDS), sans
  // renvoyer d'erreur sur le reste — rien d'autre ne 400 ici, et un client qui
  // propose un identifiant inconnu se voit simplement ignoré. Tout coché
  // revient à ne rien restreindre : on enregistre alors la liste vide, qui
  // suivra d'elle-même les évolutions de la liste scolaire.
  //
  // LE PIÈGE : l'UPSERT ci-dessous écrase toute colonne qu'il nomme, et
  // l'écran de déverrouillage (src/context/SessionSetup.tsx) n'envoie que le
  // tuteur et la recherche web. Sans cette précaution, il effacerait en
  // silence la sélection posée depuis /session. On ne remplace donc la liste
  // que si l'appel la porte VRAIMENT ; sinon on reconduit celle de la séance
  // EN COURS — une séance expirée, elle, repart sans restriction.
  let providersCsv: string;
  if (Array.isArray(req.body?.providers)) {
    const choisis = (req.body.providers as unknown[])
      .map(v => String(v).trim())
      .filter((id): id is ProviderId => isProviderId(id) && SCHOOL_PROVIDER_IDS.includes(id));
    const uniques = Array.from(new Set(choisis));
    // « Tout coché » se mesure sur les cases RÉELLEMENT proposées par la
    // console (/api/session-status) : la liste scolaire restreinte aux
    // fournisseurs dont la plateforme détient une clé. Comparée à
    // SCHOOL_PROVIDER_IDS entière, une école dont l'un des fournisseurs n'a pas
    // de clé interne n'aurait jamais pu enregistrer « aucune restriction ».
    const univers = SCHOOL_PROVIDER_IDS.filter(id => !!String(DeveloperKeys[id] || '').trim());
    // TOUT DÉCOCHÉ N'EST PAS TOUT AUTORISÉ. La chaîne vide dit « aucune
    // restriction » : y ranger une sélection vide retournerait le geste le plus
    // fermé de l'enseignant en le plus ouvert de tous. On écrit alors le jeton
    // SEANCE_SANS_FOURNISSEUR, qui se relit en « liste posée, mais vide » —
    // plus rien ne passe sur la clé de l'école, la clé personnelle reste seule.
    // `univers.length > 0` : sur un serveur sans aucune clé interne, « tout
    // coché » serait vrai par vacuité et transformerait une sélection vide en
    // « aucune restriction ». Le cas est théorique — rien n'est servable —, la
    // règle ne l'est pas : on ne déduit jamais l'ouverture d'une liste vide.
    providersCsv = univers.length > 0 && univers.every(id => uniques.includes(id)) ? ''
      : uniques.length ? uniques.join(',') : SEANCE_SANS_FOURNISSEUR;
  } else {
    const encours = getDb().prepare(
      'SELECT providers FROM session_settings WHERE etablissement_id = ? AND expires_at > ?')
      .get(targetEtabId, Date.now()) as { providers: string } | undefined;
    // Reconduction : on recopie la restriction, y compris quand plus aucun
    // identifiant ne lui survit (jeton « aucun », ou fournisseur écarté depuis
    // par la plateforme). La rendre vide en chemin l'aurait effacée.
    const repris = parseFournisseursSeance(encours?.providers);
    providersCsv = repris.length ? repris.join(',')
      : seanceRestreinte(encours?.providers) ? SEANCE_SANS_FOURNISSEUR : '';
  }

  const expiresAt = lockExpiry || Date.now() + MaxUnlockMinutes * 60_000;
  getDb().prepare(`
    INSERT INTO session_settings (etablissement_id, default_prompt_id, web_search, providers, set_by_email, expires_at)
    VALUES (@id, @promptId, @webSearch, @providers, @email, @expires)
    ON CONFLICT(etablissement_id) DO UPDATE SET
      default_prompt_id = @promptId, web_search = @webSearch, providers = @providers,
      set_by_email = @email, expires_at = @expires
  `).run({ id: targetEtabId, promptId, webSearch, providers: providersCsv, email: auth?.email ?? null, expires: expiresAt });

  res.status(200).json({ ok: true, expiresAt });
}
