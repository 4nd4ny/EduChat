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
// SUR LE RGPD, DEUX PHRASES ET RIEN DE PLUS : la protection vient du CONTRAT
// D'API PAYANT — les échanges ne servent pas à entraîner les modèles — mais
// les données demeurent une trentaine de jours chez le fournisseur. Le fait
// se suffit à lui-même ; le commentaire qui l'entourait (« écrire aucune
// donnée conservée serait faux… ») allongeait un bloc déjà long sans rien
// apprendre de plus à qui doit l'expliquer à sa direction.
//
// LE BLOC N'EST PAS PEINT PARTOUT. Il vit sur /etablissement — l'accueil de
// l'école, l'écran qui précède l'inscription, la console du responsable —
// parce que c'est là qu'on doit pouvoir reprendre l'argument tel quel. Il a
// quitté l'accueil du site (un élève n'a que faire d'un montage financier) et
// la démonstration guidée (il n'y était qu'un pavé de plus à survoler).
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
      {/* Les deux portes de sortie du bloc, CENTRÉES : elles ne prolongent pas
          la dernière phrase, elles ouvrent deux pages — au fer à gauche, elles
          se lisaient comme un cinquième paragraphe. Le centrage s'arrête à
          cette ligne ; le corps garde le `text-left` de la section, un
          paragraphe centré de cette longueur étant illisible. */}
      <p className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        <Link href="/rgpd" className="underline opacity-70 hover:opacity-100">{t("pourquoi.rgpdLink")}</Link>
        <Link href="/etablissements" className="underline opacity-70 hover:opacity-100">{t("etab.guide.link")}</Link>
      </p>
    </section>
  );
}
