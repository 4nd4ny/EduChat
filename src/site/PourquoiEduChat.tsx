import Link from "next/link";
import React from "react";
import { MdAccountBalance } from "react-icons/md";
import { useT } from "../i18n/useT";

// POURQUOI CE SITE EXISTE — le texte le plus important du site, et celui qui
// manquait. Un visiteur arrivait sur un catalogue de tuteurs sans comprendre
// ce que la plateforme AJOUTE : elle ne fabrique pas les modèles, elle règle
// un problème d'argent et de droit que l'école ne peut pas régler seule.
//
// UN SEUL composant pour l'accueil du site ET l'accueil d'un établissement :
// deux rédactions du même argument finiraient par diverger, et c'est
// précisément le paragraphe RGPD qu'il ne faut jamais laisser dériver.
//
// SUR LE RGPD, ON RESTE EXACT, MÊME QUAND C'EST MOINS VENDEUR : la protection
// vient du CONTRAT D'API PAYANT — les échanges ne servent pas à entraîner les
// modèles — mais ils demeurent trente jours chez le fournisseur. Écrire
// « aucune donnée conservée » serait faux, et une promesse fausse faite à une
// école est exactement ce qui la met en défaut le jour d'un contrôle.
export default function PourquoiEduChat() {
  const t = useT();
  return (
    <section className="rounded-lg border border-white/10 bg-secondary p-4 text-left text-sm">
      <h2 className="flex items-center gap-2 font-bold">
        <MdAccountBalance className="text-[#DC6521]" /> {t("pourquoi.title")}
      </h2>
      <p className="mt-2 opacity-85">{t("pourquoi.paiement")}</p>
      <p className="mt-2 opacity-85">{t("pourquoi.tiers")}</p>
      <p className="mt-2 opacity-85">{t("pourquoi.acces")}</p>
      <p className="mt-2 opacity-85">{t("pourquoi.rgpd")}</p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Link href="/rgpd" className="underline opacity-70 hover:opacity-100">{t("pourquoi.rgpdLink")}</Link>
        <Link href="/etablissements" className="underline opacity-70 hover:opacity-100">{t("etab.guide.link")}</Link>
      </p>
    </section>
  );
}
