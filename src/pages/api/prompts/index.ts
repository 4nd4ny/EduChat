import { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { getDb } from '../../../server/db';
import {
  listPublished, isValidPromptName, getByName, porteeAppelant,
  MAX_PROMPT_BYTES, MAX_USER_BYTES,
} from '../../../server/prompts';
import { requireAuth } from '../../../server/token';
import { ecoleEnseignante, ecolePrincipale } from '../../../server/appartenance';
import { resolveEtablissementByIp } from '../../../server/etablissements';
import { getClientIp, isRateLimited } from '../../../server/access';
import { ERR } from '../../../shared/providers';

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

// GET  /api/prompts — catalogue trié en base, et FILTRÉ SELON L'APPELANT :
//   son école dit quels tuteurs réservés il voit, le réseau d'où il écrit dit
//   si les publics du dehors lui parviennent (voir porteeAppelant,
//   src/server/prompts.ts). Un enseignant identifié emporte donc son école
//   chez lui : c'est là qu'il prépare la classe du lendemain.
// POST /api/prompts — créer un BROUILLON (« en construction ») :
//   - signé (Authorization: Bearer) : rattaché à l'auteur, soumis à son quota de 1 Mo ;
//   - anonyme : possible (décision client), la validation sera le seul filtre.
//     L'URL secrète renvoyée est alors l'unique « clé » du proposant pour tester
//     et soumettre son brouillon. La modération revient au site — ou, si le
//     dépôt vient du réseau d'un établissement, aux enseignants de CETTE école,
//     à qui le rattachement posé ci-dessous donne un titre pour agir.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const sort = String(req.query.sort ?? 'score').slice(0, 16);
    const q = String(req.query.q ?? '').slice(0, 64).trim();
    // La locale vient du client (router.locale) : une route d'API Next ne la
    // reçoit pas du routage i18n, et la déduire de Accept-Language
    // contredirait le choix de langue explicite du visiteur.
    const locale = String(req.query.locale ?? '').slice(0, 5);
    // La réponse dépend du jeton et de l'école active annoncée : un cache
    // partagé servirait le catalogue réservé d'une école au visiteur suivant.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      prompts: listPublished(sort, q, locale, porteeAppelant(req, getClientIp(req))),
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 10, 'publish')) {
    return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });
  }

  const auth = requireAuth(req);
  const name = String(req.body?.name ?? '').trim();
  const description = String(req.body?.description ?? '').trim().slice(0, 500);
  const language = ['fr', 'en', 'it', 'de'].includes(req.body?.language) ? req.body.language : 'fr';
  const body = String(req.body?.body ?? '');
  const webSearch = req.body?.webSearch ? 1 : 0;
  const sizeBytes = Buffer.byteLength(body, 'utf8');
  // Affiliation (étape « variantes ») : nom du tuteur source → id stocké en
  // métadonnée. Silencieusement ignoré si le nom ne correspond à rien.
  const inspiredByName = String(req.body?.inspiredBy ?? '').trim().slice(0, 64);
  const inspiredById = inspiredByName ? (getByName(inspiredByName)?.id ?? null) : null;

  if (!isValidPromptName(name)) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });
  if (getByName(name)) return res.status(409).json({ error: { code: 'ERR_NAME_TAKEN' } });
  if (sizeBytes < 40) return res.status(400).json({ error: { code: 'ERR_BODY_TOO_SHORT' } });
  if (sizeBytes > MAX_PROMPT_BYTES) return res.status(413).json({ error: { code: 'ERR_BODY_TOO_LARGE' } });

  const db = getDb();

  // Quota par utilisateur (1 Mo) — pour les auteurs identifiés uniquement :
  // l'anonyme n'a pas de compte, la modération a priori est son garde-fou.
  // La suppression n'existant plus, les prompts ARCHIVÉS par l'administration
  // sortent du décompte : le quota reste libérable (jamais un cliquet).
  if (auth) {
    const used = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM prompts WHERE author_email = ? AND archived = 0')
      .get(auth.email) as { total: number }).total;
    if (used + sizeBytes > MAX_USER_BYTES) {
      return res.status(413).json({ error: { code: 'ERR_QUOTA_USER' } });
    }
  }

  // RATTACHEMENT À L'ÉCOLE DU DÉPÔT — jamais reçu du client : c'est une
  // propriété du geste, pas une préférence de l'auteur. Deux sources, dans
  // cet ordre :
  //
  //   1. l'ÉCOLE DU COMPTE signataire, relue en base ;
  //   2. à défaut, l'ÉTABLISSEMENT DE L'ADRESSE IP d'où vient le dépôt.
  //
  // LE SECOND POINT EST NOUVEAU, et c'est lui qui donne un modérateur aux
  // PROPOSITIONS ANONYMES : sans école notée au moment du dépôt, rien ne
  // permettra plus tard de dire qu'un tuteur sans auteur relevait d'un
  // établissement — l'information n'existe qu'à cet instant, et on ne la
  // reconstitue pas. Les enseignants de cette école peuvent dès lors relire,
  // corriger, valider et modérer ce qui a été proposé chez eux
  // (src/server/admin.ts, requireGestionTuteurs).
  //
  // RGPD : on enregistre l'ÉTABLISSEMENT RÉSOLU, jamais l'adresse IP — une IP
  // d'établissement désigne une école, une IP conservée en base désignerait un
  // particulier. resolveEtablissementByIp ne rend qu'un identifiant d'école, et
  // l'adresse ne quitte pas cette fonction. Hors établissement, le rattachement
  // reste NULL : le catalogue de la plateforme, visible de tous, comme avant.
  //
  // ─── POURQUOI PAS L'ÉCOLE ACTIVE TOUTE SEULE ───
  //
  // RATTACHER, C'EST CONFISQUER, et il faut le dire ainsi pour choisir juste.
  // Un tuteur rattaché à une école sort du catalogue public : CLAUSE_VISIBLE
  // (src/server/prompts.ts) ne le montre plus qu'au réseau de cette école tant
  // qu'elle ne l'a pas « partagé » — et ce geste-là appartient à son
  // administration. Les enseignants de l'école y gagnent en outre le droit de
  // relire, corriger et valider le texte.
  //
  // Or l'école ACTIVE, seule, se contente d'un LIEN D'APPARTENANCE — et ce
  // lien se RAMASSE : vérifier son adresse depuis une IP d'établissement en
  // pose un (src/pages/api/verify/confirm.ts), élèves et visiteurs de passage
  // compris. Un promptagogue ayant un jour créé son compte depuis le wifi d'un
  // collège aurait vu, DEPUIS CHEZ LUI ET POUR TOUJOURS, chacun de ses tuteurs
  // disparaître du catalogue public au profit de ce collège-là, sans rien lui
  // dire et sans pouvoir l'en sortir lui-même.
  //
  // ON EXIGE DONC UN TITRE — c'est très exactement ce que rend ecoleEnseignante
  // (src/server/appartenance.ts), la fonction commune à toutes les vues où
  // l'école du compte l'emporte sur celle de l'IP : administrer cette école, ou
  // en être l'enseignant au sens où elle en répond. C'est ce qui rend à la
  // décision B ce qui lui revient — un enseignant partagé entre deux collèges
  // rattache bien son tuteur à celui qu'il a choisi — sans donner la même chose
  // à qui n'a fait que passer.
  //
  // LE REPLI SUR L'ÉCOLE PRINCIPALE n'est pas décoratif : c'est le
  // comportement d'avant le multi-écoles (users.etablissement_id), et il couvre
  // le PROMPTAGOGUE NON-ENSEIGNANT qu'une administration a rattaché — ni admin,
  // ni is_teacher, donc invisible du test ci-dessus, et dont les tuteurs
  // doivent pourtant continuer d'appartenir à son école.
  const parLeCompte = !auth ? null : (ecoleEnseignante(req) ?? ecolePrincipale(auth.email));
  const etablissementId = parLeCompte ?? resolveEtablissementByIp(ip)?.id ?? null;

  const now = Date.now();
  const shareToken = crypto.randomBytes(16).toString('hex');
  const info = db.prepare(`
    INSERT INTO prompts (name, author_email, author_name, language, description, body, version,
                         status, share_token, web_search, created_at, updated_at, size_bytes, inspired_by,
                         etablissement_id)
    VALUES (@name, @email, @authorName, @language, @description, @body, 1,
            'draft', @shareToken, @webSearch, @now, @now, @sizeBytes, @inspiredById,
            @etablissementId)
  `).run({
    name, email: auth?.email ?? null, authorName: auth?.name ?? '',
    language, description, body, shareToken, webSearch, now, sizeBytes, inspiredById,
    etablissementId,
  });
  db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, 1, ?, ?)')
    .run(info.lastInsertRowid, body, now);

  res.status(201).json({ name, shareToken, status: 'draft' });
}
