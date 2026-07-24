import Head from "next/head";
import Link from "next/link";
import React from "react";
import { MdSchool } from "react-icons/md";

// Guide dédié aux ÉTABLISSEMENTS — page séparée du guide général (le sujet
// n'intéresse pas les autres utilisateurs). En français uniquement.
// Contient : mode d'emploi, diagrammes de flux (responsable / enseignant /
// élève), quotas & facturation, sécurité de l'identification par IP.

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
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-20 text-primary">
      <Head><title>Guide des établissements — EduChat</title></Head>
      <h1 className="flex items-center gap-2 text-3xl font-bold"><MdSchool /> Guide des établissements</h1>
      <p className="mt-2 opacity-80">
        EduChat s'adresse aux écoles comme à leurs enseignants et élèves. Ce guide explique comment une
        école ouvre l'accès à ses élèves, déploie des tuteurs, maîtrise son budget et est facturée — et
        comment chacun s'y retrouve. Les élèves, eux, n'ont <b>rien à installer, aucun compte, aucune clé</b>.
      </p>

      {/* --- En bref --- */}
      <Section id="apercu" title="En bref">
        <ul className="list-inside list-disc space-y-1">
          <li>Une école est <b>reconnue par ses adresses réseau (IP)</b>. Depuis ces adresses, aux horaires qu'elle a fixés, l'accès s'ouvre automatiquement pour ses élèves.</li>
          <li>C'est la <b>clé d'IA de la plateforme</b> qui répond (nous la gérons) ; l'école n'a pas à fournir de clé. Sa consommation est mesurée et facturée — sauf pour les écoles <b>RESPIRE</b>, gratuites.</li>
          <li>Un enseignant « <b>déploie</b> » un tuteur : tous les élèves de l'école le retrouvent pré-sélectionné.</li>
          <li>Un enseignant désigné <b>responsable</b> règle lui-même horaires et budgets, en libre-service.</li>
          <li><b>Aucune donnée nominative d'élève</b> n'est stockée : ni compte, ni conversation sur le serveur.</li>
        </ul>
      </Section>

      {/* --- Les trois parcours --- */}
      <Section id="parcours" title="Les parcours, en trois schémas">
        <p>Trois rôles, trois parcours simples. Règle commune : l'IP sert à <b>reconnaître</b> l'établissement
          (accès, quotas, facture), jamais à <b>autoriser une gestion</b> — celle-ci exige toujours un compte
          vérifié dont le rattachement est relu en base (protection contre l'usurpation d'IP, voir plus bas).</p>

        <Doc title="1 · Le responsable d'établissement (un enseignant)"
          flow={[
            { label: "Vérifier son email", kind: "start" },
            { label: "Rattaché par l'admin" },
            { label: "Ouvrir « Mon établissement »" },
            { label: "Régler horaires + budgets" },
            { label: "Enregistré", kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li>Il crée son compte sur <Link className="underline" href="/verifier">/verifier</Link> (code email, sans mot de passe) en cochant « je suis enseignant·e ».</li>
            <li>L'administrateur d'EduChat le <b>rattache</b> à son établissement — l'étape de confiance qui fait de lui le responsable.</li>
            <li>Sur <Link className="underline" href="/etablissement">/etablissement</Link>, il définit lui-même les <b>créneaux horaires</b> d'accès libre, le <b>quota quotidien par élève</b> et le <b>plafond mensuel</b>. Il voit sa consommation, mais ne touche ni aux IP ni à la facturation (réservées à l'admin).</li>
          </ul>
        </Doc>

        <Doc title="2 · L'enseignant en classe"
          flow={[
            { label: "Aller sur /school", kind: "start" },
            { label: "IP de l'école aux horaires ?", kind: "decision" },
            { label: "Sinon : mot de passe de session" },
            { label: "Choisir le tuteur de la classe" },
            { label: "Élèves prêts", kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li>Depuis une IP de l'établissement, aux horaires définis, <Link className="underline" href="/school">/school</Link> s'ouvre <b>tout seul</b>.</li>
            <li>Hors créneau (sortie, cours du soir...), l'enseignant ouvre une session ponctuelle avec le <b>mot de passe de session</b> (durée choisie en suffixe : « motdepasse90 » = 90 min).</li>
            <li>Une fois entré, il « <b>déploie</b> » un tuteur : tous les élèves de l'IP le reçoivent pré-sélectionné, et il décide d'autoriser ou non la recherche web.</li>
            <li>Sa consommation est attribuée à son nom dans le bilan mensuel.</li>
          </ul>
        </Doc>

        <Doc title="3 · L'élève"
          flow={[
            { label: "Ouvrir EduChat en classe", kind: "start" },
            { label: "Poser sa question au tuteur" },
            { label: "Quota du jour atteint ?", kind: "decision" },
            { label: "Si atteint : revenir demain" },
            { label: "Apprendre en réfléchissant", kind: "end" },
          ]}>
          <ul className="list-inside list-disc space-y-1">
            <li><b>Aucun compte, aucune clé, aucun mot de passe.</b> L'élève arrive, le tuteur du jour est déjà là, il pose sa question.</li>
            <li>La <b>clé de la plateforme</b> répond, financée par l'établissement.</li>
            <li>S'il atteint son <b>quota quotidien</b>, l'accès gratuit se met en pause jusqu'au lendemain — un message le lui dit. Il peut toujours utiliser sa propre clé.</li>
            <li>Ses conversations restent dans <b>son</b> navigateur ; rien de nominatif n'est stocké sur le serveur.</li>
          </ul>
        </Doc>
      </Section>

      {/* --- Le responsable : mode d'emploi --- */}
      <Section id="responsable" title="Le responsable : régler son établissement">
        <p>Sur <Link className="underline" href="/etablissement">/etablissement</Link>, en libre-service (une fois rattaché par l'admin) :</p>
        <ul className="list-inside list-disc space-y-1">
          <li><b>Horaires d'accès libre</b> : des créneaux « jour + de … à … », ajoutés d'un clic. Hors créneau, l'accès gratuit par le réseau de l'école est fermé (un enseignant peut toujours ouvrir une session par mot de passe). Sans aucun créneau, l'accès suit le réglage global d'EduChat.</li>
          <li><b>Quota quotidien par élève</b> : empêche qu'un élève épuise le budget commun. Remis à zéro chaque jour. Vide = sans limite.</li>
          <li><b>Plafond mensuel</b> de l'établissement : au-delà, la clé interne se met en pause jusqu'au mois suivant. C'est le vrai garde-fou budgétaire — nous recommandons d'en fixer un.</li>
          <li><b>Consommation du mois</b> par fournisseur d'IA, en lecture seule.</li>
        </ul>
        <p className="text-xs opacity-60">Les quotas s'expriment en <b>tokens</b>, l'unité de facturation de l'IA (à titre indicatif, une question + réponse ≈ 1 000 à 3 000 tokens selon la longueur).</p>
      </Section>

      {/* --- Quotas & facturation --- */}
      <Section id="donnees" title="Quotas, facturation et données">
        <ul className="list-inside list-disc space-y-1">
          <li>Chaque réponse sur la clé interne est journalisée : <b>date, IP d'établissement, fournisseur, modèle, tokens</b>, identifiant anonyme d'élève (pour le quota) et enseignant de session le cas échéant. C'est la base de la facture.</li>
          <li>Les montants sont exprimés en <b>tokens par fournisseur</b> ; le tarif au token est appliqué au moment de facturer. Les écoles <b>RESPIRE</b> apparaissent à 0.</li>
          <li>L'administration exporte le <b>bilan mensuel</b> (par établissement/IP et par enseignant) en CSV.</li>
          <li>Les usages en clé <b>personnelle</b> (site public) ne sont <b>jamais</b> journalisés avec une IP.</li>
          <li><b>Aucune donnée nominative d'élève</b> : le quota par élève s'appuie sur un identifiant anonyme de navigateur, jamais relié à une personne.</li>
        </ul>
      </Section>

      {/* --- Sécurité IP --- */}
      <Section id="securite" title="Sécurité : l'identification par IP">
        <p>L'IP identifie l'établissement pour l'accès, les quotas et la facture. Pour qu'on ne puisse pas
          <b> usurper</b> l'IP d'une école (et consommer son budget), EduChat n'accorde foi à l'adresse
          transmise que si la connexion vient réellement de son proxy de confiance — prouvé par un secret
          partagé. Une requête directe qui prétendrait venir d'une école est ramenée à sa vraie adresse, qui
          ne correspond à aucun établissement.</p>
        <p>La <b>gestion</b> (page « Mon établissement ») ne repose jamais sur l'IP : elle exige le compte du
          responsable, dont le rattachement est revérifié à chaque requête. Une IP, même reconnue, ne donne
          donc <b>aucun pouvoir de gestion</b> — seulement l'accès des élèves.</p>
      </Section>

      {/* --- Pour l'administrateur --- */}
      <Section id="admin" title="Pour l'administrateur EduChat">
        <ul className="list-inside list-disc space-y-1">
          <li>Sur <Link className="underline" href="/admin">/admin</Link> : déclarer un établissement (nom, <b>adresses IP</b>, statut RESPIRE, plafond mensuel, quota par élève, contact de facturation).</li>
          <li><b>Rattacher</b> un enseignant (qui a coché « je suis enseignant·e » sur /verifier) à son établissement — il en devient responsable.</li>
          <li>Exporter la <b>facturation</b> mensuelle en CSV, par établissement/IP et par enseignant.</li>
          <li>Les IP restent une décision administrative : le responsable ne peut pas les changer lui-même.</li>
        </ul>
      </Section>
    </div>
  );
}
