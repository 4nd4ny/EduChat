import Head from "next/head";
import Link from "next/link";
import React from "react";
import { MdArrowBack } from "react-icons/md";

// Diagrammes de flux des cas d'utilisation liés à un établissement.
// Rendus en SVG inline, sans dépendance : trois parcours simples et lisibles
// (responsable, enseignant, élève), chacun documenté sous le schéma.

type Step = { label: string; kind?: "start" | "action" | "decision" | "end" };

function Flow({ steps }: { steps: Step[] }) {
  const W = 640, boxH = 46, gap = 26;
  const height = steps.length * (boxH + gap) + 10;
  const cx = W / 2;
  const color = (k?: string) =>
    k === "start" ? "#4FC3F7" : k === "decision" ? "#FFD54F" : k === "end" ? "#81C784" : "#DC6521";
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full max-w-xl" role="img">
      <defs>
        <marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgb(160,160,160)" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const y = 8 + i * (boxH + gap);
        const isDecision = s.kind === "decision";
        return (
          <g key={i}>
            {i > 0 && (
              <line x1={cx} y1={y - gap} x2={cx} y2={y} stroke="rgb(160,160,160)" strokeWidth="1.5" markerEnd="url(#ar)" />
            )}
            {isDecision ? (
              <polygon points={`${cx},${y} ${cx + 150},${y + boxH / 2} ${cx},${y + boxH} ${cx - 150},${y + boxH / 2}`}
                fill={color(s.kind)} opacity="0.9" />
            ) : (
              <rect x={cx - 175} y={y} width="350" height={boxH}
                rx={s.kind === "start" || s.kind === "end" ? boxH / 2 : 8}
                fill={color(s.kind)} opacity="0.9" />
            )}
            <text x={cx} y={y + boxH / 2 + 4} textAnchor="middle" fontSize="13" fontWeight="600" fill="#111">
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const Doc = ({ title, children, flow }: { title: string; flow: Step[]; children: React.ReactNode }) => (
  <section className="mt-10">
    <h2 className="text-xl font-bold">{title}</h2>
    <div className="mt-4 flex flex-col items-center gap-6 md:flex-row md:items-start">
      <div className="shrink-0"><Flow steps={flow} /></div>
      <div className="text-sm leading-relaxed opacity-90">{children}</div>
    </div>
  </section>
);

export default function FluxPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 text-primary">
      <Head><title>Parcours établissement — EduChat</title></Head>
      <nav className="pt-6 pb-4">
        <Link href="/tutoriel" className="flex w-fit items-center gap-1 text-sm opacity-70 hover:opacity-100">
          <MdArrowBack /> Guide
        </Link>
      </nav>
      <h1 className="text-3xl font-bold">Parcours d'un établissement</h1>
      <p className="mt-2 opacity-80">
        Trois rôles, trois parcours simples. L'établissement est reconnu par ses adresses réseau (IP) ;
        la gestion, elle, passe toujours par un compte vérifié — jamais par la seule IP.
      </p>

      <Doc title="1 · Le responsable d'établissement (un enseignant)"
        flow={[
          { label: "Vérifier son email", kind: "start" },
          { label: "Se faire rattacher par l'admin" },
          { label: "Ouvrir « Mon établissement »" },
          { label: "Régler horaires + budgets" },
          { label: "Enregistré", kind: "end" },
        ]}>
        <ul className="list-inside list-disc space-y-1">
          <li>Il crée son compte sur <Link className="underline" href="/verifier">/verifier</Link> (code email, sans mot de passe) en cochant « je suis enseignant·e ».</li>
          <li>L'administrateur d'EduChat le <b>rattache</b> à son établissement — étape de confiance qui fait de lui le responsable.</li>
          <li>Sur <Link className="underline" href="/etablissement">/etablissement</Link>, il définit lui-même : les <b>créneaux horaires</b> d'accès libre, le <b>quota quotidien par élève</b> et le <b>plafond mensuel</b>. Il voit sa consommation, mais ne touche ni aux IP ni à la facturation (réservées à l'admin).</li>
          <li><b>Contrôle de cohérence :</b> ces réglages exigent son jeton de compte, dont le rattachement est revérifié en base à chaque requête — une IP usurpée ne donne aucun pouvoir de gestion.</li>
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
          <li>Depuis une IP de l'établissement, aux horaires définis par le responsable, <Link className="underline" href="/school">/school</Link> s'ouvre <b>tout seul</b>.</li>
          <li>Hors créneau (sortie scolaire, cours du soir...), l'enseignant ouvre une session ponctuelle avec le <b>mot de passe de session</b>.</li>
          <li>Une fois entré, il « <b>déploie</b> » un tuteur : tous les élèves de l'IP le reçoivent pré-sélectionné, et il choisit d'autoriser ou non la recherche web.</li>
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
          <li>S'il atteint son <b>quota quotidien</b>, l'accès gratuit se met en pause jusqu'au lendemain — un message le lui dit clairement. Il peut toujours utiliser sa propre clé.</li>
          <li>Ses conversations restent dans <b>son</b> navigateur ; rien de nominatif n'est stocké sur le serveur.</li>
        </ul>
      </Doc>

      <p className="mt-10 text-xs opacity-60">
        Le quota par élève s'appuie sur un identifiant anonyme de navigateur (contournable en vidant le
        stockage) : c'est un garde-fou budgétaire dans un climat de confiance de classe, pas un verrou
        infranchissable — cohérent avec l'absence totale de compte élève.
      </p>
    </div>
  );
}
