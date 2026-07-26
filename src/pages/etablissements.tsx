import Head from "next/head";
import Link from "next/link";
import React from "react";
import { MdSchool } from "react-icons/md";
import { useT } from "../i18n/useT";

// Guide dédié aux ÉTABLISSEMENTS — page séparée du guide général (le sujet
// n'intéresse pas les autres utilisateurs). Traduite dans les quatre langues
// du site par le DICTIONNAIRE (clés « etabGuide. ») : les blocs en/it/de
// n'héritant plus du français, le compilateur nomme toute clé oubliée.
// Les libellés des étapes des diagrammes en font partie : ce sont des textes
// affichés dans les SVG, ils passent donc par t() au moment du rendu.
// Contient : mode d'emploi, diagrammes de flux (responsable / enseignant /
// élève), quotas & facturation, sécurité de l'identification par IP.

/**
 * Les phrases traduites sont du texte simple — jamais du HTML, pour qu'aucune
 * balise ne puisse s'y glisser et pour que chaque langue garde son ordre des
 * mots (l'allemand déplace ce que le français met en tête). Deux marques y
 * sont donc écrites en clair, et rendues ici : **gras**, et [/route] pour un
 * lien interne dont le libellé est la route elle-même.
 */
function avecMarquage(texte: string): React.ReactNode {
  const morceaux = texte.split(/(\*\*[^*]+\*\*|\[\/[a-z]+\])/g);
  return morceaux.map((morceau, i) => {
    if (/^\*\*[^*]+\*\*$/.test(morceau)) return <b key={i}>{morceau.slice(2, -2)}</b>;
    if (/^\[\/[a-z]+\]$/.test(morceau)) {
      const route = morceau.slice(1, -1);
      return <Link key={i} className="underline" href={route}>{route}</Link>;
    }
    return <React.Fragment key={i}>{morceau}</React.Fragment>;
  });
}

// --- Diagramme de flux minimal, en SVG inline (sans dépendance) -------------

type Step = { label: string; kind?: "start" | "action" | "decision" | "end" };

function Flow({ steps }: { steps: Step[] }) {
  const W = 620, boxH = 44, gap = 24;
  const height = steps.length * (boxH + gap) - gap + 12;
  const cx = W / 2;
  const color = (k?: string) =>
    k === "start" ? "#4FC3F7" : k === "decision" ? "#FFD54F" : k === "end" ? "#81C784" : "#DC6521";
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full max-w-sm" role="img">
      <defs>
        <marker id="far" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgb(160,160,160)" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const y = 6 + i * (boxH + gap);
        const isDec = s.kind === "decision";
        return (
          <g key={i}>
            {i > 0 && <line x1={cx} y1={y - gap} x2={cx} y2={y} stroke="rgb(160,160,160)" strokeWidth="1.5" markerEnd="url(#far)" />}
            {isDec ? (
              <polygon points={`${cx},${y} ${cx + 150},${y + boxH / 2} ${cx},${y + boxH} ${cx - 150},${y + boxH / 2}`}
                fill={color(s.kind)} opacity="0.9" />
            ) : (
              <rect x={cx - 175} y={y} width="350" height={boxH}
                rx={s.kind === "start" || s.kind === "end" ? boxH / 2 : 8} fill={color(s.kind)} opacity="0.9" />
            )}
            <text x={cx} y={y + boxH / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const Doc = ({ title, flow, children }: { title: string; flow: Step[]; children: React.ReactNode }) => (
  <section className="mt-10">
    <h3 className="text-xl font-bold">{title}</h3>
    <div className="mt-4 flex flex-col items-center gap-6 md:flex-row md:items-start">
      <div className="shrink-0"><Flow steps={flow} /></div>
      <div className="text-sm leading-relaxed opacity-90">{children}</div>
    </div>
  </section>
);

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mt-12 scroll-mt-6">
    <h2 className="border-b border-white/10 pb-2 text-2xl font-bold">{title}</h2>
    <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed opacity-90">{children}</div>
  </section>
);

export default function GuideEtablissements() {
  const t = useT();
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{`${t("etab.guide.link")} — EduChat`}</title></Head>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><MdSchool /> {t("etab.guide.link")}</h1>
      <p className="mt-2 opacity-80">{avecMarquage(t("etabGuide.intro"))}</p>

      {/* --- En bref --- */}
      <Section id="apercu" title={t("etabGuide.brief.title")}>
        <ul className="list-inside list-disc space-y-1">
          <li>{avecMarquage(t("etabGuide.brief.ip"))}</li>
          <li>{avecMarquage(t("etabGuide.brief.key"))}</li>
          <li>{avecMarquage(t("etabGuide.brief.deploy"))}</li>
          <li>{avecMarquage(t("etabGuide.brief.manager"))}</li>
          <li>{avecMarquage(t("etabGuide.brief.noData"))}</li>
        </ul>
      </Section>

      {/* --- Les trois parcours --- */}
      <Section id="parcours" title={t("etabGuide.paths.title")}>
        <p>{avecMarquage(t("etabGuide.paths.intro"))}</p>

        <Doc title={t("etabGuide.manager.title")}
          flow={[
            { label: t("etabGuide.manager.step1"), kind: "start" },
            { label: t("etabGuide.manager.step2") },
            { label: t("etabGuide.manager.step3") },
            { label: t("etabGuide.manager.step4") },
            { label: t("etabGuide.manager.step5"), kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li>{avecMarquage(t("etabGuide.manager.account"))}</li>
            <li>{avecMarquage(t("etabGuide.manager.attach"))}</li>
            <li>{avecMarquage(t("etabGuide.manager.settings"))}</li>
          </ul>
        </Doc>

        <Doc title={t("etabGuide.teacher.title")}
          flow={[
            { label: t("etabGuide.teacher.step1"), kind: "start" },
            { label: t("etabGuide.teacher.step2"), kind: "decision" },
            { label: t("etabGuide.teacher.step3") },
            { label: t("etabGuide.teacher.step4") },
            { label: t("etabGuide.teacher.step5"), kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li>{avecMarquage(t("etabGuide.teacher.auto"))}</li>
            <li>{avecMarquage(t("etabGuide.teacher.password"))}</li>
            <li>{avecMarquage(t("etabGuide.teacher.deploy"))}</li>
            <li>{avecMarquage(t("etabGuide.teacher.usage"))}</li>
          </ul>
        </Doc>

        <Doc title={t("etabGuide.pupil.title")}
          flow={[
            { label: t("etabGuide.pupil.step1"), kind: "start" },
            { label: t("etabGuide.pupil.step2") },
            { label: t("etabGuide.pupil.step3"), kind: "decision" },
            { label: t("etabGuide.pupil.step4") },
            { label: t("etabGuide.pupil.step5"), kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li>{avecMarquage(t("etabGuide.pupil.noAccount"))}</li>
            <li>{avecMarquage(t("etabGuide.pupil.key"))}</li>
            <li>{avecMarquage(t("etabGuide.pupil.quota"))}</li>
            <li>{avecMarquage(t("etabGuide.pupil.local"))}</li>
          </ul>
        </Doc>
      </Section>

      {/* --- Le responsable : mode d'emploi --- */}
      <Section id="responsable" title={t("etabGuide.settings.title")}>
        <p>{avecMarquage(t("etabGuide.settings.intro"))}</p>
        <ul className="list-inside list-disc space-y-1">
          <li>{avecMarquage(t("etabGuide.settings.hours"))}</li>
          <li>{avecMarquage(t("etabGuide.settings.perStudent"))}</li>
          <li>{avecMarquage(t("etabGuide.settings.monthly"))}</li>
          <li>{avecMarquage(t("etabGuide.settings.usage"))}</li>
        </ul>
        <p className="text-xs opacity-60">{avecMarquage(t("etabGuide.settings.tokens"))}</p>
      </Section>

      {/* --- Quotas & facturation --- */}
      <Section id="donnees" title={t("etabGuide.data.title")}>
        <ul className="list-inside list-disc space-y-1">
          <li>{avecMarquage(t("etabGuide.data.log"))}</li>
          <li>{avecMarquage(t("etabGuide.data.amounts"))}</li>
          <li>{avecMarquage(t("etabGuide.data.export"))}</li>
          <li>{avecMarquage(t("etabGuide.data.personalKey"))}</li>
          <li>{avecMarquage(t("etabGuide.data.anonymous"))}</li>
        </ul>
      </Section>

      {/* --- Sécurité IP --- */}
      <Section id="securite" title={t("etabGuide.security.title")}>
        <p>{avecMarquage(t("etabGuide.security.spoofing"))}</p>
        <p>{avecMarquage(t("etabGuide.security.management"))}</p>
      </Section>

      {/* --- Pour l'administrateur --- */}
      <Section id="admin" title={t("etabGuide.admin.title")}>
        <ul className="list-inside list-disc space-y-1">
          <li>{avecMarquage(t("etabGuide.admin.declare"))}</li>
          <li>{avecMarquage(t("etabGuide.admin.attach"))}</li>
          <li>{avecMarquage(t("etabGuide.admin.billing"))}</li>
          <li>{avecMarquage(t("etabGuide.admin.ips"))}</li>
        </ul>
      </Section>
    </div>
  );
}
