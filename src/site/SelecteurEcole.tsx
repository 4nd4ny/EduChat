import React, { useCallback, useEffect, useState } from "react";
import { MdAdminPanelSettings, MdSchool } from "react-icons/md";
import { useT } from "../i18n/useT";
import { authHeaders, getEcoleActive, setEcoleActive } from "../utils/account";

// LE SÉLECTEUR D'ÉCOLE ACTIVE — en haut de tout l'espace enseignant.
//
// Un compte peut appartenir à plusieurs écoles (décision B du socle). Tout ce
// qu'un écran d'école affiche — porte-monnaie, comptes, facture, tuteurs —
// dépend donc d'une question préalable : DEPUIS LAQUELLE travaille-t-on ?
// Cette question doit être posée UNE fois, visiblement, en haut de l'écran, et
// jamais devinée section par section.
//
// CE COMPOSANT NE DONNE AUCUN DROIT. Il pose une préférence, que authHeaders()
// joint aux requêtes (x-educhat-ecole) et que le serveur revérifie contre la
// table de liaison à chaque appel. Le rang « administratrice » affiché ici
// n'est qu'un écho de ce que la base a répondu : ce qu'il ouvre à l'écran, le
// serveur l'ouvrirait de toute façon, et ce qu'il cache, le serveur le
// refuserait.

export type EcoleDuCompte = {
  id: number;
  name: string;
  /** Administrateur DE CETTE école — jamais des autres. */
  isAdmin: boolean;
  /** users.etablissement_id : l'école par défaut du compte. */
  principale: boolean;
};

export type EtatEcoles = {
  /** La réponse de /api/me est arrivée (succès ou échec) : on peut décider. */
  pret: boolean;
  ecoles: EcoleDuCompte[];
  /** L'école active, telle que le SERVEUR l'a résolue puis que l'on a choisie. */
  active: number | null;
  /** Administrateur de l'école ACTIVE — la seule question qui vaille ici. */
  administre: boolean;
  /** Super-administrateur du site (SECRET_ADMIN_EMAILS). */
  isSuper: boolean;
  /**
   * Le rôle d'ENSEIGNANT (users.is_teacher), et non la seule appartenance.
   *
   * La distinction est vitale depuis que vérifier son adresse depuis une IP
   * d'école pose un lien : tout ÉLÈVE de l'établissement est « membre ». Ce
   * qui s'adresse aux enseignants — la modération des tuteurs de l'école —
   * se règle donc sur ce champ, comme le fait le serveur (estEnseignantDe).
   */
  isTeacher: boolean;
  /** Le compte est-il identifié ? (jeton accepté par /api/me) */
  identifie: boolean;
  choisir: (id: number) => void;
};

/**
 * L'état des écoles du compte, lu une fois sur /api/me.
 *
 * On ne se réabonne PAS à « ecoleChanged » : c'est ce hook qui l'émet, et s'y
 * remettre à l'écoute relancerait /api/me à chaque changement d'école — donc
 * en boucle. Les sections, elles, reçoivent l'école active en propriété et se
 * relisent d'elles-mêmes quand elle change.
 */
export function useEcoles(): EtatEcoles {
  const [ecoles, setEcoles] = useState<EcoleDuCompte[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [identifie, setIdentifie] = useState(false);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let vivant = true;
    const relire = () => {
      fetch("/api/me", { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => {
          if (!vivant) return;
          setEcoles(Array.isArray(d.ecoles) ? d.ecoles : []);
          setIsSuper(!!d.isSuper);
          setIsTeacher(!!d.isTeacher);
          setIdentifie(true);
          // LE SERVEUR A DÉJÀ TRANCHÉ. Ce qu'il renvoie dans ecoleActive est
          // toujours une école dont le lien existe à cet instant. Si le
          // navigateur en réclamait une autre — lien retiré entre deux
          // visites —, on adopte la sienne ET on la réécrit : sans cela, le
          // stockage local continuerait d'annoncer à chaque requête un choix
          // que le serveur corrige en silence, et l'écran afficherait une
          // école pendant que les chiffres viendraient d'une autre.
          const serveur: number | null = typeof d.ecoleActive === "number" ? d.ecoleActive : null;
          if (getEcoleActive() !== serveur) setEcoleActive(serveur);
          setActive(serveur);
          setPret(true);
        })
        .catch(() => {
          if (!vivant) return;
          setEcoles([]); setActive(null); setIdentifie(false); setIsTeacher(false); setPret(true);
        });
    };
    relire();
    window.addEventListener("accountChanged", relire);
    return () => { vivant = false; window.removeEventListener("accountChanged", relire); };
  }, []);

  const choisir = useCallback((id: number) => {
    setEcoleActive(id);
    setActive(id);
  }, []);

  return {
    pret, ecoles, active, isSuper, isTeacher, identifie, choisir,
    administre: ecoles.some(e => e.id === active && e.isAdmin),
  };
}

/**
 * UN ÉTAT D'ÉCOLES FICTIF, pour les démonstrations (?visite=1).
 *
 * Qu'un même compte enseigne dans plusieurs écoles est la nouveauté qui change
 * le plus de choses à l'écran : c'est le sélecteur qui décide de quelle école
 * parlent le porte-monnaie, la facture, les comptes et le catalogue. Le taire
 * en démonstration le rendait invisible à tous ceux qui n'ont pas encore de
 * compte — c'est-à-dire au public de l'aide.
 *
 * Rien n'est lu, rien n'est écrit : `choisir` ne fait rien, et aucune requête
 * ne part. La deuxième école est délibérément une école où l'on enseigne SANS
 * l'administrer : c'est la situation la plus fréquente, et celle qui explique
 * pourquoi la moitié des sections apparaît ou disparaît en changeant d'école.
 */
export function ecolesDemo(principale: string, seconde: string): EtatEcoles {
  return {
    pret: true, active: 1, administre: true, isSuper: false,
    isTeacher: true, identifie: true, choisir: () => { /* démonstration inerte */ },
    ecoles: [
      { id: 1, name: principale, isAdmin: true, principale: true },
      { id: 2, name: seconde, isAdmin: false, principale: false },
    ],
  };
}

/**
 * La barre du haut de l'espace enseignant.
 *
 * Un menu déroulant d'UNE entrée n'est pas un choix, c'est un obstacle : avec
 * une seule école, on affiche son nom. Le rang y figure dans les deux cas —
 * c'est lui qui explique pourquoi la moitié des sections apparaît ou non.
 */
export default function SelecteurEcole({ etat }: { etat: EtatEcoles }) {
  const t = useT();
  if (!etat.pret || etat.ecoles.length === 0) return null;
  const courante = etat.ecoles.find(e => e.id === etat.active);

  return (
    <div data-tour="ecole-selecteur"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-secondary px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 opacity-70">
        <MdSchool className="text-[#DC6521]" /> {t("ecole.active.label")}
      </span>
      {etat.ecoles.length > 1 ? (
        <select value={etat.active ?? ""} onChange={e => etat.choisir(Number(e.target.value))}
          aria-label={t("ecole.active.label")} className="rounded bg-tertiary px-2 py-1">
          {etat.ecoles.map(e => (
            <option key={e.id} value={e.id}>
              {e.name}{e.principale ? ` ${t("ecole.active.principale")}` : ""}
            </option>
          ))}
        </select>
      ) : (
        <b>{courante?.name ?? etat.ecoles[0].name}</b>
      )}
      {etat.administre ? (
        <span className="flex items-center gap-1 rounded bg-[#DC6521]/25 px-1.5 text-xs text-[#DC6521]"
          title={t("ecole.active.adminTitle")}>
          <MdAdminPanelSettings /> {t("ecole.active.admin")}
        </span>
      ) : (
        <span className="rounded border border-white/20 px-1.5 text-xs opacity-60"
          title={t("ecole.active.teacherTitle")}>
          {t("ecole.active.teacher")}
        </span>
      )}
      {etat.ecoles.length > 1 && (
        <span className="text-xs opacity-60">{t("ecole.active.hint")}</span>
      )}
    </div>
  );
}
