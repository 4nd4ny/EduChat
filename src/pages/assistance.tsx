import Head from "next/head";
import Link from "next/link";
import React from "react";
import {
  MdArrowBack, MdBolt, MdBuild, MdMemory, MdSupportAgent, MdVerifiedUser, MdWarningAmber,
} from "react-icons/md";
import { useT } from "../i18n/useT";

// Contact / assistance, et présentation de l'offre de SERVEUR LOCAL.
//
// POURQUOI UNE PAGE ET NON UN PANNEAU DANS /etablissement :
//   1. le sujet du serveur local est une décision de DÉPENSE : le responsable
//      la transmet à sa direction, à son service informatique, parfois à son
//      délégué à la protection des données. Il lui faut une URL stable qu'on
//      colle dans un courriel, et une page qui s'imprime — un panneau replié
//      dans un écran de réglages ne se partage pas ;
//   2. /etablissement est derrière une garde (compte + rattachement). Or le
//      besoin d'assistance est le plus vif JUSTEMENT quand la garde refuse
//      l'entrée : la page doit rester lisible sans compte ;
//   3. le dépôt a déjà cette convention — /rgpd et /etablissements sont des
//      pages de contenu autonomes, et l'écran de réglages (252 lignes) n'a
//      pas besoin de grossir d'un long texte commercial.
//
// AUCUN CHIFFRE n'est écrit ici : ni prix, ni puissance, ni délai de réponse,
// ni durée de vie du matériel. Chaque poste de coût porte à la place une
// mention « à préciser avec vous ». Un tarif inventé dans une page
// commerciale n'engage personne et se paie en crédibilité.

// L'adresse n'est pas dans le dictionnaire : elle est identique dans les
// quatre langues, et quatre copies d'une même chaîne, c'est trois occasions
// de la corriger à moitié le jour où elle change.
const EMAIL = "contact@harmonia.education";

/** Un poste de coût : le titre, la contrepartie dite franchement, puis la
 *  mention « à préciser avec vous » — visible sous CHAQUE poste, pour qu'on
 *  ne puisse pas lire la page en croyant qu'un seul reste à chiffrer. */
function Poste({ icone, titre, corps, tbd }: {
  icone: React.ReactNode; titre: string; corps: string; tbd: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-secondary p-4">
      <h3 className="flex items-center gap-2 font-bold">
        <span className="text-[#DC6521]">{icone}</span> {titre}
      </h3>
      <p className="mt-2 text-sm leading-relaxed opacity-80">{corps}</p>
      <p className="mt-3 inline-block rounded border border-dashed border-white/25 px-2 py-1 text-xs uppercase tracking-wide opacity-60">
        {tbd}
      </p>
    </div>
  );
}

export default function AssistancePage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{`${t("assistance.title")} — EduChat`}</title></Head>

      <h1 className="flex items-center gap-2 text-3xl font-bold">
        <MdSupportAgent /> {t("assistance.title")}
      </h1>
      <p className="mt-3 leading-relaxed opacity-80">{t("assistance.lead")}</p>

      {/* --- Nous joindre --- */}
      <section className="mt-10">
        <h2 className="border-b border-white/10 pb-2 text-2xl font-bold">{t("assistance.contact.title")}</h2>
        <a href={`mailto:${EMAIL}`}
          className="mt-4 inline-block rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90">
          {EMAIL}
        </a>
        <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed opacity-85">
          <p>{t("assistance.contact.human")}</p>
          <p>{t("assistance.contact.noSla")}</p>
        </div>
        <h3 className="mt-6 font-bold">{t("assistance.contact.useful.title")}</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm opacity-80">
          <li>{t("assistance.contact.useful.school")}</li>
          <li>{t("assistance.contact.useful.what")}</li>
          <li>{t("assistance.contact.useful.where")}</li>
        </ul>
      </section>

      {/* --- Serveur local --- */}
      <section className="mt-12">
        <h2 className="border-b border-white/10 pb-2 text-2xl font-bold">{t("assistance.local.title")}</h2>
        <p className="mt-4 text-sm leading-relaxed opacity-85">{t("assistance.local.intro")}</p>

        {/* L'argument RGPD passe devant tout le reste : c'est le plus fort, et
            c'est celui qui décide une direction d'établissement. */}
        <div className="mt-6 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-4">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <MdVerifiedUser className="text-[#DC6521]" /> {t("assistance.local.rgpd.title")}
          </h3>
          <p className="mt-2 text-sm leading-relaxed opacity-90">{t("assistance.local.rgpd.body")}</p>
          <p className="mt-2 text-sm leading-relaxed opacity-90">{t("assistance.local.rgpd.body2")}</p>
        </div>

        <h3 className="mt-8 text-lg font-bold">{t("assistance.local.gains.title")}</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-relaxed opacity-85">
          <li>{t("assistance.local.gains.tokens")}</li>
          <li>{t("assistance.local.gains.budget")}</li>
          <li>{t("assistance.local.gains.quotas")}</li>
        </ul>

        <h3 className="mt-8 text-lg font-bold">{t("assistance.local.costs.title")}</h3>
        <p className="mt-2 text-sm leading-relaxed opacity-85">{t("assistance.local.costs.intro")}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Poste icone={<MdMemory />} titre={t("assistance.local.costs.hardware.title")}
            corps={t("assistance.local.costs.hardware.body")} tbd={t("assistance.local.tbd")} />
          <Poste icone={<MdBolt />} titre={t("assistance.local.costs.power.title")}
            corps={t("assistance.local.costs.power.body")} tbd={t("assistance.local.tbd")} />
          <Poste icone={<MdBuild />} titre={t("assistance.local.costs.admin.title")}
            corps={t("assistance.local.costs.admin.body")} tbd={t("assistance.local.tbd")} />
          <Poste icone={<MdWarningAmber />} titre={t("assistance.local.costs.models.title")}
            corps={t("assistance.local.costs.models.body")} tbd={t("assistance.local.tbd")} />
        </div>

        <div className="mt-8 rounded-lg border border-white/10 bg-secondary p-4">
          <h3 className="font-bold">{t("assistance.local.noFigures.title")}</h3>
          <p className="mt-2 text-sm leading-relaxed opacity-80">{t("assistance.local.noFigures.body")}</p>
        </div>

        <h3 className="mt-8 text-lg font-bold">{t("assistance.local.next.title")}</h3>
        <p className="mt-2 text-sm leading-relaxed opacity-85">{t("assistance.local.next.body")}</p>
        <a href={`mailto:${EMAIL}`}
          className="mt-4 inline-block rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
          {EMAIL}
        </a>
      </section>

      <p className="mt-12 text-sm">
        <Link href="/etablissement" className="inline-flex items-center gap-1 underline opacity-70 hover:opacity-100">
          <MdArrowBack /> {t("assistance.back")}
        </Link>
      </p>
    </div>
  );
}
