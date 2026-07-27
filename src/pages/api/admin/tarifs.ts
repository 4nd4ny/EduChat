import { NextApiRequest, NextApiResponse } from 'next';
import { PORTEE_ECOLE, porteeEcoleActive, requireAdmin, requireSuperAdmin } from '../../../server/admin';
import { getEtablissementById } from '../../../server/etablissements';
import { tarifs, reglerTarif } from '../../../server/facturation';
import { propositions, sonderTarifs, lienVerification, RATIO_ENTREE } from '../../../server/sondeTarifs';
import { BillingCurrency, BillingSurchargePct } from '../../../utils/env';
import { PROVIDER_IDS, type ProviderId } from '../../../shared/providers';
import { ERR } from '../../../shared/providers';

// TARIF DE LA CLÉ INTERNE, par fournisseur, pour un million de jetons.
//
// DEUX LECTURES, ET DEUX RÉPONSES DISTINCTES — jamais une seule qu'on
// tronquerait selon le rang de qui la demande :
//   · SANS `?portee=ecole`, la vue du SITE, réservée au super-administrateur :
//     chaque fournisseur, ses trois barreaux, le tarif retenu et le mélange.
//     C'est là que l'échelle s'arbitre, et on n'arbitre pas entre des niveaux
//     dont on ne voit qu'un prix.
//   · AVEC `?portee=ecole`, la vue d'une ÉCOLE : les barreaux de SON SEUL
//     fournisseur actif, chacun avec son prix d'entrée et son prix de sortie.
//     Six chiffres, et rien d'autre (décision du propriétaire) — c'est ce qu'un
//     enseignant peut lire sans arbitrer, et le mélange n'en fait pas partie
//     parce qu'il suppose un rapport entrée/sortie que personne ne mesure.
//
// LA PORTÉE VIENT DE L'ÉCRAN, PAS DU RANG, et c'est la seule façon de rendre sa
// page à un super-administrateur : le sien est aussi un compte d'école
// (/etablissement), et servir la vue du site sur le seul motif de son rang lui
// affichait « aucun fournisseur actif » à l'endroit où son collège en a un. Le
// drapeau n'ÉLARGIT rien — il ne peut que resserrer une portée déjà accordée,
// exactement comme sur /api/admin/prompts.
//
// ÉCRITURE réservée au site : le tarif vaut pour toutes les écoles, une seule
// d'entre elles ne peut pas le fixer.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const scope = requireAdmin(req);
    if (!scope) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });
    const propose = propositions();

    // ─── CE QU'UNE ÉCOLE LIT : LES BARREAUX DE SON SEUL FOURNISSEUR ───
    //
    // Cette route refusait naguère les barreaux à une école, au motif que
    // l'échelle est l'affaire du super-administrateur et que /api/admin/ladder
    // en refuse jusqu'à la lecture. Le motif tenait pour l'ÉCHELLE ENTIÈRE —
    // les onze fournisseurs, leurs listes, ce qu'on pourrait y changer. Il ne
    // tient pas pour la question qu'une école se pose : « ce que nos élèves
    // consomment, combien ça coûte le million de jetons ? ». On sert donc les
    // barreaux de SON fournisseur actif, nommés (un prix sans le nom du modèle
    // ne se vérifie pas), et de lui seul : l'arbitrage entre fournisseurs reste
    // entier de l'autre côté.
    if (req.query.portee === PORTEE_ECOLE) {
      // L'ÉCOLE ACTIVE, REVÉRIFIÉE — celle du sélecteur pour un super, celle
      // que requireAdmin a déjà résolue et dont le lien est déjà relu pour un
      // administrateur d'école. Aucune des deux ne vient du navigateur seul.
      const vue = porteeEcoleActive(req, scope);
      if (!vue || vue.niveau !== 'ecole') {
        return res.status(403).json({ error: { code: 'ERR_NO_ETABLISSEMENT' } });
      }
      const etab = getEtablissementById(vue.etablissementId);
      // La colonne telle qu'elle est réglée, sans repli : inventer un
      // fournisseur pour éviter une ligne vide reviendrait à afficher le prix
      // d'un catalogue que cette école n'emploie pas.
      const actif = String(etab?.active_provider ?? '');
      const prop = actif ? propose[actif] : undefined;
      return res.status(200).json({
        providerActif: actif,
        // `null` couvre d'un coup les trois absences que l'écran doit dire en
        // une ligne plutôt qu'en tableau vide : aucun fournisseur réglé, un
        // fournisseur que la sonde n'interroge pas (hors SCHOOL_PROVIDER_IDS),
        // une sonde qui n'a pas encore tourné.
        echelle: prop ? {
          // La monnaie et la date SONT des données de la mesure, servies avec
          // elle : un prix sans sa monnaie se convertit deux fois ou pas du
          // tout, et un prix sans sa date se croit éternel.
          devise: prop.devise, at: prop.at,
          // LE MÉLANGE NE PASSE MÊME PAS LE FIL. Il est dans le JSON stocké
          // (propose_barreaux) et il aurait suivi tout seul : on le retire
          // champ par champ. Un nombre qui arrive au navigateur finit un jour
          // à l'écran — il suffit d'une colonne ajoutée de bonne foi — et
          // celui-là suppose un rapport entrée/sortie que rien ne mesure.
          // Ce qui reste est exactement ce que le tableau montre.
          barreaux: prop.barreaux.map(b => ({
            rang: b.rang, barreau: b.barreau, modele: b.modele,
            entreeMtok: b.entreeMtok, sortieMtok: b.sortieMtok, detail: b.detail,
          })),
          verifier: (PROVIDER_IDS as readonly string[]).includes(actif)
            ? lienVerification(actif as ProviderId) : null,
        } : null,
      });
    }

    // LA VUE DU SITE NE DESCEND PLUS VERS UNE ÉCOLE, même amputée de ses
    // barreaux : ce qu'une école a besoin de lire a désormais sa propre
    // réponse, et une liste de onze fournisseurs dont dix ne la concernent pas
    // n'a jamais rien répondu à personne.
    if (scope.niveau !== 'super') return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
    const courants = tarifs();
    return res.status(200).json({
      devise: BillingCurrency,
      participationPct: BillingSurchargePct,
      ratioEntree: RATIO_ENTREE,
      tarifs: PROVIDER_IDS.map(provider => ({
        provider,
        prixMtok: courants[provider] ?? 0,
        proposition: propose[provider] ?? null,
        // OÙ RECOUPER CE TARIF. Rendu même quand la sonde n'a encore rien
        // proposé : c'est justement là qu'on a besoin d'aller voir soi-même.
        // Null hors des trois fournisseurs d'école — la sonde ne les
        // interroge pas, un lien laisserait croire le contraire.
        verifier: lienVerification(provider),
      })),
    });
  }

  if (req.method === 'POST') {
    if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_SUPER_ONLY' } });
    // Relancer la sonde à la main : elle tourne normalement quand la liste des
    // modèles change, mais on veut pouvoir la déclencher sans attendre.
    if (req.body?.action === 'sonder') {
      return res.status(200).json({ ok: true, propositions: await sonderTarifs() });
    }
    const provider = String(req.body?.provider ?? '');
    const prix = Number(req.body?.prixMtok);
    if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
      return res.status(400).json({ error: { code: 'ERR_PROVIDER_UNKNOWN' } });
    }
    if (!Number.isFinite(prix) || prix < 0) return res.status(400).json({ error: { code: 'ERR_PRICE_INVALID' } });
    reglerTarif(provider, prix);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
