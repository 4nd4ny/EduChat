import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, PromptRow } from '../../../../server/db';
import { getPublishedByName, getByName, toCard, isValidPromptName, MAX_PROMPT_BYTES, MAX_USER_BYTES } from '../../../../server/prompts';
import { requireAuth, isAdminEmail, TokenPayload } from '../../../../server/token';
import { getClientIp, isRateLimited } from '../../../../server/access';
import { notifyAdmin } from '../../../../server/mail';
import { ERR } from '../../../../shared/providers';
import { planifierTraduction, traduireTuteur, resumeTraductions, traductionFraiche } from '../../../../server/traduction';

export const config = { api: { bodyParser: { sizeLimit: '512kb' } } };

// Cycle de vie d'un prompt (pivot v3 + décisions v2, amendé le 24 juillet) :
//   draft ── submit ──▶ pending ── approve ──▶ published ── retire ──▶ retired
//                                                  ▲── republish ──────┘
// PRINCIPE : on ne SUPPRIME jamais rien — les compteurs de tokens doivent
// rester recalculables pour la facturation. « retire » (dépublier) est
// réversible ; « archive » (admin) masque définitivement le prompt de
// l'interface d'administration, mais la ligne reste en base.
// L'auteur d'un brouillon est identifié par son jeton, OU par l'URL secrète
// (share_token) pour les propositions anonymes.

type Rights = {
  isAuthor: boolean;      // jeton de l'auteur, ou share_token du brouillon
  isAdmin: boolean;
  isPromptagogue: boolean; // compte vérifié : peut approuver (décision client)
  auth: TokenPayload | null;
};

function resolveRights(req: NextApiRequest, row: PromptRow): Rights {
  const auth = requireAuth(req);
  const shareToken = String(req.body?.shareToken ?? '');
  const byToken = !!auth && !!row.author_email && auth.email === row.author_email;
  const byShare = !!row.share_token && shareToken === row.share_token;
  const isAdmin = !!auth && isAdminEmail(auth.email);
  let isPromptagogue = false;
  if (auth) {
    const user = getDb().prepare('SELECT is_promptagogue FROM users WHERE email = ?').get(auth.email) as
      { is_promptagogue: number } | undefined;
    isPromptagogue = !!user?.is_promptagogue;
  }
  return { isAuthor: byToken || byShare, isAdmin, isPromptagogue, auth };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name ?? '');

  // ---- GET : fiche publique (prompts publiés uniquement) --------------------
  if (req.method === 'GET') {
    const row = getPublishedByName(name);
    if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
    const db = getDb();
    const versions = db
      .prepare('SELECT version, created_at AS createdAt, length(body) AS sizeBytes FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC')
      .all(row.id);
    // Filiation : le tuteur source (s'il existe encore et est publié) et les
    // variantes PUBLIÉES qui s'inspirent de celui-ci.
    const inspiredBy = row.inspired_by
      ? (db.prepare("SELECT name FROM prompts WHERE id = ? AND status = 'published'")
        .get(row.inspired_by) as { name: string } | undefined)?.name ?? null
      : null;
    const variants = (db.prepare("SELECT name FROM prompts WHERE inspired_by = ? AND status = 'published' ORDER BY name")
      .all(row.id) as { name: string }[]).map(v => v.name);
    // Le CORPS suit la même règle que la carte : la traduction fraîche, ou
    // l'original. C'est ce corps que la fiche affiche en entier — un tuteur
    // appartient au domaine public, sa traduction aussi.
    const locale = String(req.query.locale ?? '').slice(0, 5);
    const tr = traductionFraiche(row.id, row.version, locale);
    return res.status(200).json({
      prompt: {
        ...toCard(row, locale), body: tr?.body ?? row.body, inspiredBy, variants,
        translations: resumeTraductions(row).etats,
      },
      versions,
    });
  }

  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).json({ error: { code: ERR.METHOD } });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 20, 'prompt-write')) return res.status(429).json({ error: { code: ERR.RATE_LIMIT } });

  const db = getDb();
  const row = getByName(name);
  if (!row) return res.status(404).json({ error: { code: 'ERR_PROMPT_UNKNOWN' } });
  const rights = resolveRights(req, row);
  const now = Date.now();

  // Un prompt ARCHIVÉ est figé : plus AUCUNE transition ni édition (sinon un
  // prompt refusé pourrait être ressuscité — voire republié — tout en restant
  // invisible de l'interface d'administration).
  if (row.archived) return res.status(409).json({ error: { code: 'ERR_ARCHIVED' } });

  // ---- DELETE : DÉSACTIVÉ (décision client du 24 juillet) — on ne supprime
  // jamais rien, la facturation des tokens doit rester recalculable. Dépublier
  // (retire) retire du catalogue ; archiver (admin) masque de l'administration.
  if (req.method === 'DELETE') {
    return res.status(403).json({ error: { code: 'ERR_DELETE_DISABLED' } });
  }

  // ---- PATCH : édition et transitions --------------------------------------
  const action = String(req.body?.action ?? 'edit');

  if (action === 'edit') {
    if (!rights.isAuthor && !rights.isAdmin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    const body = req.body?.body !== undefined ? String(req.body.body) : row.body;
    const description = req.body?.description !== undefined
      ? String(req.body.description).trim().slice(0, 500) : row.description;
    const webSearch = req.body?.webSearch !== undefined ? (req.body.webSearch ? 1 : 0) : row.web_search;
    const sizeBytes = Buffer.byteLength(body, 'utf8');
    if (sizeBytes < 40) return res.status(400).json({ error: { code: 'ERR_BODY_TOO_SHORT' } });
    if (sizeBytes > MAX_PROMPT_BYTES) return res.status(413).json({ error: { code: 'ERR_BODY_TOO_LARGE' } });

    if (row.author_email) {
      // Même règle qu'à la création : les prompts archivés ne comptent plus.
      const used = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM prompts WHERE author_email = ? AND id != ? AND archived = 0')
        .get(row.author_email, row.id) as { total: number }).total;
      if (used + sizeBytes > MAX_USER_BYTES) return res.status(413).json({ error: { code: 'ERR_QUOTA_USER' } });
    }

    const bodyChanged = body !== row.body;
    // TOUTE modification du texte crée une nouvelle version (décision client
    // du 25 juillet) : l'historique reste lisible quel que soit l'état du
    // prompt, et les conversations en cours restent sur la leur — la bascule
    // demeure explicite (décision n°9).
    const bumpVersion = bodyChanged;
    const version = bumpVersion ? row.version + 1 : row.version;
    db.transaction(() => {
      db.prepare('UPDATE prompts SET body = ?, description = ?, web_search = ?, version = ?, updated_at = ?, size_bytes = ? WHERE id = ?')
        .run(body, description, webSearch, version, now, sizeBytes, row.id);
      if (bumpVersion) {
        db.prepare('INSERT INTO prompt_versions (prompt_id, version, body, created_at) VALUES (?, ?, ?, ?)')
          .run(row.id, version, body, now);
      } else if (bodyChanged) {
        db.prepare('UPDATE prompt_versions SET body = ?, created_at = ? WHERE prompt_id = ? AND version = ?')
          .run(body, now, row.id, row.version);
      }
    })();

    // Le corps a changé sur un tuteur PUBLIÉ : ses traductions décrivent
    // désormais un texte qui n'existe plus. Elles ne sont pas effacées — elles
    // deviennent périmées, donc plus servies, et l'original reprend la main
    // dans les quatre langues. L'administration est prévenue : c'est elle qui
    // vérifie la modification et relance la traduction. Sans ce message, la
    // « vérification admin » n'aurait aucun déclencheur.
    if (bumpVersion && row.status === 'published') {
      notifyAdmin(
        `Traductions à revérifier : ${row.name}`,
        `Le tuteur « ${row.name} » vient de passer en version ${version}.\n` +
        `Ses traductions (en, it, de) datent de la version ${row.version} : elles ne sont plus servies,\n` +
        `et les élèves lisent de nouveau l'original en ${row.language}.\n\n` +
        `Vérifiez la modification puis relancez la traduction depuis /admin.`,
      );
    }
    return res.status(200).json({ ok: true, version });
  }

  if (action === 'submit') {
    if (!rights.isAuthor) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'draft') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'pending', updated_at = ? WHERE id = ?").run(now, row.id);
    // L'administration est prévenue qu'un prompt attend en modération —
    // surtout important pour les propositions anonymes, qu'elle seule filtre.
    notifyAdmin(
      `Prompt à modérer : ${row.name}`,
      `Le tuteur « ${row.name} » vient d'être soumis à validation.\n` +
      `Auteur : ${row.author_email ? `${row.author_name} <${row.author_email}>` : 'ANONYME (modération par vos soins)'}\n` +
      `Langue : ${row.language} — Taille : ${(row.size_bytes / 1024).toFixed(1)} Ko\n` +
      `Description : ${row.description}`,
    );
    return res.status(200).json({ ok: true, status: 'pending' });
  }

  if (action === 'approve') {
    // Modération a priori : approbation par un admin OU par un promptagogue
    // vérifié (décision client — la validation protège surtout le flux anonyme).
    if (!(rights.isAdmin || rights.isPromptagogue)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    // Un promptagogue ne valide que ce qui lui est SOUMIS. L'administration,
    // elle, peut publier un BROUILLON directement : elle est de toute façon
    // l'autorité de modération, elle en lit le texte dans la même page, et
    // exiger un aller-retour par l'URL secrète de l'auteur — seul chemin vers
    // « soumis » — laissait des brouillons sans aucune issue vers le catalogue.
    const etatsValidables = rights.isAdmin ? ['pending', 'draft'] : ['pending'];
    if (!etatsValidables.includes(row.status)) return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'published', updated_at = ? WHERE id = ?").run(now, row.id);
    // Un tuteur validé est traduit dans les trois autres langues. En ARRIÈRE-PLAN :
    // trois appels au fournisseur prendraient une minute, et une clé sans crédit
    // ferait échouer une publication qui, elle, a bel et bien eu lieu.
    planifierTraduction(row.id);
    return res.status(200).json({ ok: true, status: 'published' });
  }

  if (action === 'retire') {
    const authorCanRetire = !!row.author_email && rights.auth?.email === row.author_email;
    if (!(rights.isAdmin || authorCanRetire)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'published') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'retired', updated_at = ? WHERE id = ?").run(now, row.id);
    return res.status(200).json({ ok: true, status: 'retired' });
  }

  // ---- republish : un prompt dépublié revient au catalogue, dans l'état où
  // il était (il a déjà passé la validation ; l'éditer reste possible avant).
  if (action === 'republish') {
    const authorCan = !!row.author_email && rights.auth?.email === row.author_email;
    if (!(rights.isAdmin || authorCan)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status !== 'retired') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare("UPDATE prompts SET status = 'published', updated_at = ? WHERE id = ?").run(now, row.id);
    // Un prompt dépublié a souvent été modifié avant de revenir : ses
    // traductions sont alors périmées. Rien à tester ici, traduireTuteur est
    // idempotent — ce qui est déjà à jour ne coûte pas un jeton.
    planifierTraduction(row.id);
    return res.status(200).json({ ok: true, status: 'published' });
  }

  // ---- retranslate : l'administration a VÉRIFIÉ une modification et demande
  // la retraduction. C'est le « en cas de validation » du cycle : tant qu'elle
  // n'a pas cliqué, la traduction périmée n'est pas servie, et c'est
  // l'original que lit l'élève.
  if (action === 'retranslate') {
    if (!rights.isAdmin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    // Attendu, celui-ci : l'administration veut voir le résultat, pas un accusé
    // de réception. Trois appels à Haiku sur un prompt de quelques kilo-octets.
    const etats = await traduireTuteur(row.id, req.body?.force === true);
    return res.status(200).json({ ok: true, translations: etats });
  }

  // ---- rename : ADMIN uniquement. Prévu pour les prompts DÉPUBLIÉS (les
  // conversations en cours référencent le tuteur par son nom : renommer un
  // prompt publié les casserait — l'interface ne le propose que dépublié,
  // le serveur l'interdit publié).
  if (action === 'rename') {
    if (!rights.isAdmin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    // Renommer un prompt PUBLIÉ est désormais permis (décision client du
    // 25 juillet). Ce n'est pas anodin et l'interface le dit avant d'agir :
    // le nom EST l'adresse publique (/p/nom), les liens déjà partagés
    // tomberont, et les conversations en cours référencent l'ancien nom —
    // elles perdront l'affichage de leur tuteur. Rien n'est détruit pour
    // autant : l'id, les compteurs et les versions ne bougent pas.
    const newName = String(req.body?.newName ?? '').trim();
    if (!isValidPromptName(newName)) return res.status(400).json({ error: { code: 'ERR_NAME_INVALID' } });
    if (newName !== row.name && getByName(newName)) return res.status(409).json({ error: { code: 'ERR_NAME_TAKEN' } });
    db.prepare('UPDATE prompts SET name = ?, updated_at = ? WHERE id = ?').run(newName, now, row.id);
    return res.status(200).json({ ok: true, name: newName });
  }

  // ---- archive : ADMIN uniquement. Masque DÉFINITIVEMENT le prompt de
  // l'interface d'administration (nettoyage) — la ligne, ses versions et ses
  // compteurs restent en base : rien n'est jamais supprimé. Un prompt publié
  // doit d'abord être dépublié.
  if (action === 'archive') {
    if (!rights.isAdmin) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    if (row.status === 'published') return res.status(409).json({ error: { code: 'ERR_STATUS' } });
    db.prepare('UPDATE prompts SET archived = 1, updated_at = ? WHERE id = ?').run(now, row.id);
    return res.status(200).json({ ok: true, archived: true });
  }

  return res.status(400).json({ error: { code: 'ERR_ACTION_UNKNOWN' } });
}
