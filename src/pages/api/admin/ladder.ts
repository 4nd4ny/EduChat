import type { NextApiRequest, NextApiResponse } from 'next';
import { getLadders, setLadder } from '../../../server/ladder';
import { getModels } from '../../../server/models';
import { requireSuperAdmin } from '../../../server/admin';
import { ERR, isProviderId } from '../../../shared/providers';

// Réglage de l'échelle de modèles, réservé à l'administration.
//
//  GET → pour chaque fournisseur : les barreaux en vigueur, la proposition du
//        code, et surtout la VALIDITÉ de chaque barreau au regard du catalogue
//        vivant. C'est ce dernier point qui rend le réglage durable : un modèle
//        épinglé aujourd'hui peut disparaître dans six mois, et le chat
//        casserait en silence.
//  PUT → { provider, rungs: string[] }. Trois barreaux vides = retour à la
//        proposition du code.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // LE SUPER-ADMINISTRATEUR, ET LUI SEUL — lecture comprise.
  //
  // La raison n'est pas hiérarchique, elle est de fond : cette échelle
  // détermine le niveau d'intelligence ET LE COÛT PAR ÉLÈVE, et elle vaut pour
  // TOUTES les écoles à la fois. Un choix hâtif, ou simplement une mise à jour
  // oubliée à la sortie d'une version, change donc d'un coup ce que chaque
  // établissement dépense par élève — sans qu'aucun d'eux l'ait demandé et
  // sans que rien ne le leur signale. Une école ne peut pas porter cette
  // décision pour les autres ; le site la porte, et l'assume.
  //
  // Ce que le tarif proposé en face (src/server/sondeTarifs.ts) rend
  // vérifiable : les trois barreaux y sont affichés avec leur prix, pour que
  // ce réglage-ci se prenne en connaissance de ce qu'il coûte.
  if (!requireSuperAdmin(req)) return res.status(403).json({ error: { code: 'ERR_FORBIDDEN' } });

  if (req.method === 'GET') {
    const lignes = await Promise.all(getLadders().map(async ligne => {
      const { models } = await getModels(ligne.provider);
      // Un catalogue réduit au seul modèle par défaut ne prouve rien : on ne
      // signale « inconnu » que si le fournisseur a vraiment publié sa liste.
      const verifiable = models.length > 1;
      return {
        ...ligne,
        verifiable,
        unknown: verifiable ? ligne.rungs.filter(m => !models.includes(m)) : [],
        catalogue: models.length,
      };
    }));
    return res.status(200).json({ ladders: lignes });
  }

  if (req.method === 'PUT') {
    const provider = req.body?.provider;
    if (!isProviderId(provider)) return res.status(400).json({ error: { code: ERR.PROVIDER } });
    const rungs = Array.isArray(req.body?.rungs) ? req.body.rungs : [];
    setLadder(provider, rungs);
    return res.status(200).json({ ok: true, ladders: getLadders() });
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ error: { code: ERR.METHOD } });
}
