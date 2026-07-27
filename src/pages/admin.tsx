import Head from "next/head";
import Link from "next/link";
import React from "react";
import { MdAdminPanelSettings } from "react-icons/md";
import { useT } from "../i18n/useT";
import { useListeSeule } from "../site/ListePaginee";
import { useEcoles } from "../site/SelecteurEcole";
import Comptes from "../administration/Comptes";
import Etablissements from "../administration/Etablissements";
import Factures from "../administration/Factures";
import PorteMonnaie from "../administration/PorteMonnaie";
import { ModerationCommentaires, ModerationTuteurs } from "../administration/Moderation";
import { CatalogueModeles, ConsommationSite, EchelleModeles } from "../administration/Modeles";

// L'ADMINISTRATION DU SITE — ET PLUS RIEN D'AUTRE.
//
// Cette page mélangeait tout : tuteurs, commentaires, comptes, porte-monnaie,
// factures, écoles, modèles. Un administrateur d'école y entrait pour y voir
// une version amputée de l'écran du site, et l'écran du site y montrait des
// réglages qui appartenaient à une école. La répartition par niveau (décision
// A) a tranché : ce qui relève d'une ÉCOLE est descendu vers /etablissement,
// ce qui relève d'une CLASSE vers /enseignant, et il ne reste ici que ce qui
// vaut pour toutes les écoles à la fois — donc pour aucune en particulier :
//
//   · les ÉTABLISSEMENTS : les créer, poser leurs IP, leurs quotas, RESPIRE ;
//   · les FACTURES, les IMPAYÉES, les TARIFS et le bilan de la participation ;
//   · le PORTE-MONNAIE de chaque école vu de haut : lesquelles sont à sec ;
//   · le RELEVÉ en jetons, par IP, et son export ;
//   · l'ÉCHELLE et le CATALOGUE des modèles.
//
// L'ACCÈS EST DÉSORMAIS RÉSERVÉ AU SITE. Les routes /api/admin/*, elles,
// continuent d'accepter les DEUX portées — c'est ce qui fait vivre
// /etablissement et /enseignant. Aucune garde n'a donc été affaiblie : on a
// seulement cessé de montrer ICI un écran dont la moitié appartenait ailleurs.
//
// LES SECTIONS SONT DES COMPOSANTS (src/administration/) : la facture, le
// porte-monnaie et les tarifs sont lus à deux endroits — le site et l'école —
// et deux copies d'un même écran divergent toujours sur le détail qui compte.
export default function AdminPage() {
  const t = useT();
  const etat = useEcoles();
  // « Tout voir » rouvre CETTE page sur une seule liste, entière. Chaque
  // section décide elle-même de se taire quand une autre est demandée : le
  // gabarit ci-dessous n'a plus qu'à cacher les titres de zone.
  const seule = useListeSeule();

  if (!etat.pret) {
    return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;
  }

  if (!etat.isSuper) {
    // Même garde d'accès que /duel, /etablissement et /enseignant : quatre
    // pages qui refusent l'entrée doivent le faire de la même façon.
    //
    // Un administrateur d'ÉCOLE n'est plus renvoyé dans le vide : son
    // administration existe, elle a seulement déménagé — le bouton la nomme.
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("admin.title")} — EduChat`}</title></Head>
        <MdAdminPanelSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("admin.denied.title")}</h1>
        <p className="mt-3 opacity-80">
          {etat.identifie ? t("admin.denied.siteOnly") : t("admin.denied.anonymous")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!etat.identifie && (
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("compte.anonymousCta")}
            </Link>
          )}
          {etat.administre && (
            <Link href="/etablissement" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("admin.denied.toSchool")}
            </Link>
          )}
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("admin.denied.backCatalogue")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${t("admin.title")} — EduChat`}</title></Head>
      <h1 className="text-2xl font-bold">{t("admin.title")}</h1>
      {!seule && (
        <>
          <p className="mt-1 text-sm opacity-70">{t("admin.site.intro")}</p>
          {/* Les trois autres administrations ne sont pas cachées : elles sont
              nommées, avec leur porte. Un super-administrateur qui cherche les
              comptes d'une école doit savoir où ils sont partis. */}
          <p className="mt-2 text-xs opacity-60">
            {t("admin.site.elsewhere")}{" "}
            <Link href="/etablissement" className="underline">{t("admin.site.linkSchool")}</Link>
            {" · "}
            <Link href="/enseignant" className="underline">{t("admin.site.linkTeacher")}</Link>
          </p>
        </>
      )}

      {/* ─── Zone 1 : les écoles ─── */}
      {!seule && (
        <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
          {t("admin.zone.schools")}
        </h2>
      )}
      <Etablissements />

      {/* RATTACHER UNE PERSONNE À UNE ÉCOLE EST UN GESTE DU SITE, au même
          titre que créer l'école : /api/admin/users refuse le champ
          `etablissementId` à quiconque n'est pas super (ERR_SUPER_ONLY). La
          section vit AUSSI sur /etablissement, où une école gère les siens —
          mais l'y laisser SEULE fermait la seule porte du site vers deux
          gestes qui n'appartiennent à aucune école : rattacher un compte, et
          régler celui qui n'a pas d'école du tout (un promptagogue isolé
          n'aurait plus eu, dans tout le produit, un seul écran pour le
          toucher). MÊME COMPOSANT, aucune règle nouvelle : la portée vient de
          la réponse du serveur, qui ne filtre rien pour un super. */}
      <Comptes ecole={etat.active} isSuper={etat.isSuper} />

      {/* ─── Zone 2 : l'argent ─── */}
      {!seule && (
        <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
          {t("admin.zone.money")}
        </h2>
      )}
      {(!seule || seule === "factures") && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">{t("admin.facture.heading")}</h2>
          <Factures ecole={etat.active} variante="site" />
        </section>
      )}
      {!seule && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">{t("admin.credit.heading")}</h2>
          <p className="mt-1 text-xs opacity-60">{t("admin.credit.helpSite")}</p>
          <PorteMonnaie ecole={etat.active} variante="site" />
        </section>
      )}
      <ConsommationSite />

      {/* ─── Zone 3 : le catalogue de la PLATEFORME ───
          La modération descend vers /enseignant pour ce qui relève d'une école
          — mais pas pour le reste. Un tuteur proposé par un auteur SANS école
          naît avec un rattachement NULL : il n'appartient à aucun
          établissement, aucun enseignant d'école ne le voit, et sans cette
          section personne ne pourrait plus le valider. Le serveur, lui, n'a
          jamais cessé de le permettre (requireGestionTuteurs rend une portée
          « super » sans filtre) : c'est l'écran qui manquait.
          Ce sont les MÊMES composants que sur /enseignant — la portée vient
          de la réponse du serveur, jamais d'une copie du code. */}
      {!seule && (
        <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
          {t("admin.zone.moderation")}
        </h2>
      )}
      <ModerationTuteurs ecole={etat.active} />
      <ModerationCommentaires ecole={etat.active} />

      {/* ─── Zone 4 : Modèles ─── */}
      {/* Réservée au site : l'échelle et le catalogue valent pour TOUTES les
          écoles, donc pour aucune en particulier. */}
      {!seule && (
        <h2 className="mt-12 border-b-2 border-[#DC6521]/50 pb-1 text-xl font-bold uppercase tracking-wide text-[#DC6521]">
          {t("admin.zone.models")}
        </h2>
      )}
      <EchelleModeles />
      <CatalogueModeles />
    </div>
  );
}
