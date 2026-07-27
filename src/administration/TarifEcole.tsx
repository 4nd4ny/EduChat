import React, { useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";

// CE QUE COÛTE UN MILLION DE JETONS, POUR UNE ÉCOLE : SIX CHIFFRES.
//
// Trois lignes — les trois barreaux de l'échelle DU FOURNISSEUR ACTIF de
// l'établissement — et deux colonnes, entrée et sortie. C'est tout, et c'est
// délibéré (décision du propriétaire).
//
// POURQUOI PAS LE « MÉLANGE », qui figurait ici avec le tarif retenu. Un prix
// unique par fournisseur suppose un rapport entre jetons d'entrée et jetons de
// sortie — 75 % d'entrée, dans la sonde — que RIEN NE MESURE : le journal
// n'additionne qu'un nombre de jetons. Ce chiffre-là ne se vérifie donc pas, et
// un chiffre d'argent qu'on ne peut pas vérifier est pire qu'un chiffre absent
// devant quelqu'un qui doit justifier un budget. Les deux prix publiés par
// l'éditeur, eux, se recoupent en un clic — d'où le lien « vérifier ».
//
// POURQUOI PAS LES AUTRES FOURNISSEURS. L'arbitrage entre éditeurs appartient
// au site (l'échelle se règle sur /admin, par le seul super-administrateur) :
// une école n'a pas à choisir, elle a à savoir ce que SON fournisseur coûte.
// Trois lignes répondent à cette question ; trente-trois la noieraient.
//
// CE QUE CE TABLEAU N'EST PAS : une facture. Il dit le prix du catalogue de
// l'éditeur, relevé à la date affichée. Le décompte réel du porte-monnaie se
// lit dans son registre, et la facture du mois juste au-dessus.

/**
 * UN BARREAU, TEL QUE LA ROUTE LE SERT À UNE ÉCOLE — et non le `BarreauTarif`
 * de commun.tsx, qui porte en plus le MÉLANGE. Le type dit ici exactement ce
 * qui traverse le fil : réutiliser celui de l'administration décrirait un champ
 * que la réponse ne contient plus, et inviterait à l'afficher.
 */
type BarreauEcole = {
  rang: number; barreau: string; modele: string;
  entreeMtok: number; sortieMtok: number;
  /** Vide quand le prix a été lu ; sinon la raison, dite au survol. */
  detail: string;
};

/** Les barreaux du fournisseur actif, tels que /api/admin/tarifs les sert à une école. */
type EchelleTarif = {
  /** Monnaie RÉELLE des montants — la monnaie de facturation, ou « USD » si le
   *  taux de change manquait le jour de la mesure. Elle vient avec eux. */
  devise: string;
  /** Date de la mesure : un prix sans sa date se croit éternel. */
  at: number;
  barreaux: BarreauEcole[];
  /** Page du catalogue public où recouper ces prix ; null hors fournisseurs d'école. */
  verifier: string | null;
};

export default function TarifEcole({ ecole }: {
  /** École active — DÉCLENCHEUR de relecture (elle voyage dans l'en-tête). */
  ecole: number | null;
}) {
  const t = useT();
  const [providerActif, setProviderActif] = useState("");
  const [echelle, setEchelle] = useState<EchelleTarif | null>(null);
  // Tant que la réponse n'est pas là, on n'affiche AUCUNE des phrases
  // d'absence : « aucun fournisseur actif » qui clignote une demi-seconde avant
  // le tableau se lit comme une panne, et on ne rassure jamais après coup.
  const [recu, setRecu] = useState(false);

  useEffect(() => {
    let vivant = true;
    setRecu(false);
    // `?portee=ecole` DEMANDE LA VUE DE L'ÉCOLE, et c'est l'écran qui la
    // demande, non le rang qui la décide : sans ce drapeau, un
    // super-administrateur — dont le compte est aussi celui d'un collège —
    // recevrait ici la vue du site et lirait « aucun fournisseur actif » sur la
    // page de son école. Le drapeau ne peut que RESSERRER une portée déjà
    // accordée (src/server/admin.ts).
    fetch("/api/admin/tarifs?portee=ecole", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => {
        if (!vivant) return;
        setProviderActif(String(d.providerActif ?? ""));
        setEchelle(d.echelle ?? null);
        setRecu(true);
      })
      .catch(() => { if (vivant) { setProviderActif(""); setEchelle(null); setRecu(true); } });
    // Le nettoyage garde la réponse d'une école DÉJÀ QUITTÉE hors de l'écran :
    // le sélecteur d'école change, deux requêtes se croisent, et la plus lente
    // afficherait le tarif du collège précédent sous le nom du nouveau.
    return () => { vivant = false; };
  }, [ecole]);

  if (!recu) return null;

  const barreaux = echelle?.barreaux ?? [];

  return (
    <div className="mt-6">
      <h3 className="font-bold">{t("etab.tarif.heading")}</h3>
      <p className="mt-1 text-xs opacity-60">{t("etab.tarif.help")}</p>

      {/* UNE PHRASE, JAMAIS UN TABLEAU VIDE. Un tableau à en-têtes sans ligne
          se lit « zéro franc » ou « en panne ». Deux phrases suffisent pour
          trois absences, parce que les deux dernières appellent la même
          patience : aucun fournisseur réglé (l'administration du site le
          désigne) ; un fournisseur réglé mais dont les prix ne sont pas
          relevés — soit que la sonde n'ait pas encore tourné, soit qu'elle
          n'interroge pas ce fournisseur-là (hors SCHOOL_PROVIDER_IDS). */}
      {!providerActif ? (
        <p className="mt-2 text-sm opacity-80">{t("etab.tarif.noProvider")}</p>
      ) : barreaux.length === 0 ? (
        <p className="mt-2 text-sm opacity-80">{t("etab.tarif.notMeasured", { provider: providerActif })}</p>
      ) : (
        <>
          <table className="mt-2 w-full max-w-xl text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="py-1">{t("etab.tarif.model")}</th>
                {/* La monnaie est DANS l'en-tête, une fois pour les six
                    chiffres : la répéter six fois encombre, l'omettre laisse
                    convertir de tête. */}
                <th className="text-right">{t("etab.tarif.in", { devise: echelle!.devise })}</th>
                <th className="text-right">{t("etab.tarif.out", { devise: echelle!.devise })}</th>
              </tr>
            </thead>
            <tbody>
              {/* AUTANT DE LIGNES QUE L'ÉCHELLE EN A, et non trois en dur :
                  l'administration peut n'en régler que deux (src/server/ladder.ts
                  arrête l'échelle au premier barreau vide), et une troisième
                  ligne inventée porterait un prix qui n'engage personne. */}
              {barreaux.map(b => (
                <tr key={b.rang} className="border-b border-white/5">
                  <td className="py-1">
                    {/* Le rang ET le nom du modèle dans UNE seule clé : le
                        séparateur n'est pas une ponctuation universelle, et
                        l'ordre des deux appartient à la langue.
                        Le nom est celui de l'ÉDITEUR (ce que l'école emploie) ;
                        celui du catalogue OpenRouter, où le prix a été lu,
                        s'obtient au survol — c'est lui qu'on retrouve derrière
                        le lien « vérifier » quand les deux diffèrent. */}
                    <span title={b.modele || undefined}>
                      {t("etab.tarif.rung", { n: b.rang, barreau: b.barreau })}
                    </span>
                  </td>
                  {/* PRIX MANQUANT : on le DIT, avec la raison au survol, au
                      lieu d'afficher deux zéros. Un zéro se lirait « gratuit »,
                      ce qui est la seule chose dont on soit certain que ce
                      n'est pas le cas — et il se recopierait dans un budget. */}
                  {b.detail ? (
                    <td colSpan={2} className="text-right text-xs">
                      <span className="rounded bg-amber-500/25 px-1 text-amber-200" title={b.detail}>
                        {t("etab.tarif.unknown")}
                      </span>
                    </td>
                  ) : (
                    <>
                      <td className="text-right font-mono">{b.entreeMtok.toFixed(2)}</td>
                      <td className="text-right font-mono">{b.sortieMtok.toFixed(2)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs opacity-50">
            {t("etab.tarif.source", {
              provider: providerActif,
              devise: echelle!.devise,
              date: echelle!.at ? new Date(echelle!.at).toLocaleDateString("fr-CH") : "—",
            })}{" "}
            {/* RECOUPER EN UN CLIC. Un tarif qu'on ne peut pas vérifier est un
                tarif qu'il faut croire : ce lien ouvre la page même où ces
                prix ont été lus. */}
            {echelle!.verifier && (
              <a href={echelle!.verifier} target="_blank" rel="noopener noreferrer"
                className="underline opacity-80 hover:opacity-100">
                {t("etab.tarif.verify")}
              </a>
            )}
          </p>
        </>
      )}
    </div>
  );
}
