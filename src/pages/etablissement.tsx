import Head from "next/head";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { MdAdd, MdDelete, MdSchool, MdSettings, MdSupportAgent } from "react-icons/md";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useT } from "../i18n/useT";
import { getAccount, authHeaders } from "../utils/account";
import { formatTokens } from "../utils/formatTokens";

type HourSlot = { day: number; start: string; end: string };
type Data = {
  etablissement: {
    name: string; ips: string; respire: boolean; hours: HourSlot[];
    quotaPerStudentDaily: number; tokenQuotaMonthly: number;
  };
  usage: { monthTokens: number; byProvider: Array<{ provider: string; requests: number; tokens: number }> };
};

// Les jours passent par le dictionnaire : l'index reste la valeur technique
// envoyée au serveur (0 = dimanche), seul le libellé est traduit.
const DAY_KEYS = [
  "etab.day.0", "etab.day.1", "etab.day.2", "etab.day.3",
  "etab.day.4", "etab.day.5", "etab.day.6",
] as const;

// Espace du responsable d'établissement — un enseignant, pas un informaticien.
// Parti pris d'interface : trois réglages seulement, expliqués en langage clair,
// avec un éditeur d'horaires visuel (pas de JSON). Les IP et la facturation
// sont montrées mais NON modifiables ici (ce sont des décisions administratives).
export default function EtablissementPage() {
  const t = useT();
  const account = typeof window !== "undefined" ? getAccount() : null;
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "auth" | "none" | "ready">("loading");
  const [hours, setHours] = useState<HourSlot[]>([]);
  const [perStudent, setPerStudent] = useState("");
  const [monthly, setMonthly] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // --- INSCRIPTION EN LIBRE-SERVICE (écran verrouillé, cas « aucune école ») ---
  // Auparavant cet écran était une impasse : il invitait à nous écrire pour
  // être désigné responsable. Personne ne pouvait démarrer seul, et le service
  // ne pouvait pas se déployer sans nous. Le formulaire vit ICI, sur la même
  // page : une route dédiée n'apporterait qu'un aller-retour de plus entre le
  // refus d'accès et sa réparation.
  const [inscription, setInscription] = useState(false);
  const [nomEcole, setNomEcole] = useState("");
  const [ipsEcole, setIpsEcole] = useState("");
  const [adresseEcole, setAdresseEcole] = useState("");
  const [inscriptionBusy, setInscriptionBusy] = useState(false);
  const [inscriptionErreur, setInscriptionErreur] = useState("");
  const [inscriptionFaite, setInscriptionFaite] = useState(false);

  // L'IP publique du visiteur est PROPOSÉE, jamais imposée : /api/ip renvoie
  // exactement le getClientIp que verront l'accès élèves et la facturation —
  // c'est donc la seule valeur dont on sache d'avance qu'elle fonctionnera.
  // Une école qui s'inscrit depuis chez elle la corrigera.
  useEffect(() => {
    if (!inscription) return;
    fetch("/api/ip")
      .then(r => r.json())
      .then((d: { ip?: string }) => {
        if (d?.ip && d.ip !== "unknown") setIpsEcole(prev => prev || d.ip!);
      })
      .catch(() => { /* simple confort de saisie : un échec ne gêne personne */ });
  }, [inscription]);

  // DÉMONSTRATION (?visite=1) : l'espace s'ouvre avec un établissement
  // FICTIF et tous les réglages inertes. Aucun appel au serveur : on montre
  // l'interface d'un responsable sans emprunter les données d'un vrai.
  const router = useRouter();
  const demo = router.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);
  const fige = demo || busy;

  useEffect(() => {
    if (!router.isReady) return;   // ?visite=1 n'est lisible qu'ensuite
    if (demo) {
      setData({
        etablissement: {
          // Le nom de l'école fictive est traduit à l'affichage (voir le titre) :
          // on ne le fige pas ici, l'état ne doit pas dépendre de la langue.
          name: "", ips: "203.0.113.0/24", respire: true,
          hours: [{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }],
          quotaPerStudentDaily: 20000, tokenQuotaMonthly: 3000000,
        },
        usage: { monthTokens: 412350, byProvider: [
          { provider: "mistral", requests: 1240, tokens: 318900 },
          { provider: "anthropic", requests: 210, tokens: 93450 },
        ] },
      });
      setHours([{ day: 1, start: "08:00", end: "17:00" }, { day: 3, start: "08:00", end: "12:00" }]);
      setPerStudent("20000"); setMonthly("3000000");
      setState("ready");
      return;
    }
    fetch("/api/etablissement", { headers: authHeaders() })
      .then(r => {
        if (r.status === 401) { setState("auth"); return null; }
        if (r.status === 403) { setState("none"); return null; }
        return r.json();
      })
      .then((d: Data | null) => {
        if (!d) return;
        setData(d);
        setHours(d.etablissement.hours);
        setPerStudent(d.etablissement.quotaPerStudentDaily ? String(d.etablissement.quotaPerStudentDaily) : "");
        setMonthly(d.etablissement.tokenQuotaMonthly ? String(d.etablissement.tokenQuotaMonthly) : "");
        setState("ready");
      })
      .catch(() => setState("auth"));
  }, [demo, router.isReady]);

  const addSlot = () => setHours([...hours, { day: 1, start: "08:00", end: "17:00" }]);
  const updateSlot = (i: number, patch: Partial<HourSlot>) =>
    setHours(hours.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSlot = (i: number) => setHours(hours.filter((_, j) => j !== i));

  const save = async () => {
    setBusy(true); setMessage("");
    // Garde-fou côté client, doublé côté serveur : début < fin.
    for (const s of hours) {
      if (s.start >= s.end) { setBusy(false); setMessage(t("etab.hours.invalid", { day: t(DAY_KEYS[s.day]) })); return; }
    }
    const response = await fetch("/api/etablissement", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        hours,
        quotaPerStudentDaily: Number(perStudent) || 0,
        tokenQuotaMonthly: Number(monthly) || 0,
      }),
    });
    setBusy(false);
    setMessage(response.ok ? t("etab.saved") : t("etab.saveFailed"));
  };

  // Chaque refus du serveur a SA phrase. Un « échec » générique sur un 409
  // « votre compte est déjà rattaché » ferait recommencer indéfiniment
  // quelqu'un qui n'a, en réalité, plus rien à faire ici.
  const messageRefus = (code: string) => {
    switch (code) {
      case "ERR_ALREADY_ATTACHED": return t("etab.signup.err.attached");
      case "ERR_IP_TAKEN": return t("etab.signup.err.ipTaken");
      case "ERR_NAME_INVALID": return t("etab.signup.err.name");
      case "ERR_IP_INVALID": return t("etab.signup.err.ip");
      case "ERR_RATE_LIMIT": return t("etab.signup.err.rate");
      case "ERR_AUTH_REQUIRED": return t("etab.signup.err.auth");
      default: return t("etab.signup.err.generic");
    }
  };

  const inscrire = async (event: React.FormEvent) => {
    event.preventDefault();
    setInscriptionBusy(true); setInscriptionErreur("");
    const response = await fetch("/api/etablissement/inscription", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      // Aucun champ de statut n'est envoyé — respire, solde et quotas ne sont
      // pas oubliés ici, ils n'appartiennent tout simplement pas à l'inscrit
      // (la route les refuserait de toute façon : elle ne les lit pas).
      body: JSON.stringify({ name: nomEcole, ips: ipsEcole, billingAddress: adresseEcole }),
    }).catch(() => null);
    setInscriptionBusy(false);
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      setInscriptionErreur(messageRefus(String(data?.error?.code ?? "")));
      return;
    }
    setInscriptionFaite(true);
  };

  if (state === "loading") return <div className="py-16 text-center text-primary opacity-60">{t("common.loading")}</div>;

  if (state === "auth" || state === "none") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center text-primary">
        <Head><title>{`${t("etab.title")} — EduChat`}</title></Head>
        {/* Même allure que la garde d'accès de /duel, et l'engrenage de la
            tuile « Établissement » de l'accueil : une même porte doit se
            reconnaître d'une page à l'autre. */}
        <MdSettings className="mx-auto mb-4 text-5xl text-[#DC6521]" />
        <h1 className="text-2xl font-bold">{t("etab.locked.title")}</h1>
        {state === "auth" ? (
          <>
            <p className="mt-3 opacity-80">{t("etab.locked.auth")}</p>
            {/* L'identification EST la première étape de l'inscription. Le dire
                ici évite qu'on lise la garde comme un refus définitif et qu'on
                referme la page avant d'avoir vu le bouton d'inscription. */}
            <p className="mt-2 text-sm opacity-70">{t("etab.signup.authHint")}</p>
          </>
        ) : (
          // Remplace l'ancien « demandez à l'administration de vous désigner
          // responsable » (etab.locked.noSchool) : c'était une impasse, aucune
          // école ne pouvait démarrer sans nous écrire.
          <p className="mt-3 opacity-80">{t("etab.signup.pitch")}</p>
        )}
        {/* Mêmes boutons, même allure que sur /duel : deux pages qui refusent
            l'accès pour la même raison doivent se ressembler.
            L'assistance figure AUSSI ici : c'est devant une porte fermée —
            « mon compte n'est rattaché à aucun établissement » — qu'on a le
            plus besoin de joindre quelqu'un. La cacher derrière la garde
            reviendrait à ne l'offrir qu'à ceux qui n'en ont pas besoin. */}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {state === "auth" && (
            <Link href="/verifier" className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("compte.anonymousCta")}
            </Link>
          )}
          {state === "none" && !inscription && !inscriptionFaite && (
            <button onClick={() => setInscription(true)}
              className="flex items-center gap-1 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              <MdSchool /> {t("etab.signup.cta")}
            </button>
          )}
          <Link href="/assistance" className="flex items-center gap-1 rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            <MdSupportAgent /> {t("assistance.button")}
          </Link>
          <Link href="/" className="rounded border border-white/20 px-4 py-2 hover:bg-tertiary">
            {t("etab.locked.back")}
          </Link>
        </div>

        {/* --- Formulaire d'inscription --- */}
        {state === "none" && inscription && !inscriptionFaite && (
          <form onSubmit={inscrire}
            className="mt-8 flex flex-col gap-4 rounded-lg border border-white/10 bg-secondary p-4 text-left text-sm">
            <h2 className="text-lg font-bold">{t("etab.signup.formTitle")}</h2>

            <label className="flex flex-col gap-1">
              {t("etab.signup.name")}
              <input value={nomEcole} onChange={e => setNomEcole(e.target.value)} required maxLength={120}
                placeholder={t("etab.signup.namePlaceholder")} className="rounded bg-tertiary p-2" />
            </label>

            <label className="flex flex-col gap-1">
              {t("etab.signup.ips")}
              <input value={ipsEcole} onChange={e => setIpsEcole(e.target.value)}
                placeholder="203.0.113.7, 203.0.113.8" className="rounded bg-tertiary p-2 font-mono" />
              <span className="text-xs opacity-60">{t("etab.signup.ipsHint")}</span>
            </label>

            <label className="flex flex-col gap-1">
              {t("etab.signup.address")}
              <textarea value={adresseEcole} onChange={e => setAdresseEcole(e.target.value)} rows={3} maxLength={500}
                placeholder={t("etab.signup.addressPlaceholder")} className="rounded bg-tertiary p-2" />
              {/* Pas d'interpolation de l'adresse email : le jeton peut avoir
                  expiré entre le chargement et le rendu, et « les factures
                  partiront à  » ne veut plus rien dire. Le serveur prend de
                  toute façon l'adresse du JETON, pas celle du formulaire. */}
              <span className="text-xs opacity-60">{t("etab.signup.addressHint")}</span>
            </label>

            {/* L'HONNÊTETÉ AVANT LA SIGNATURE, pas après : le porte-monnaie
                démarre à zéro, et aucun élève ne passera par la clé de l'école
                tant qu'il n'est pas rechargé. Le découvrir une fois inscrit
                serait une déception ; le lire ici est une décision informée. */}
            <p className="rounded border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-xs">
              <b>{t("etab.signup.warningTitle")}</b> {t("etab.signup.warning")}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={inscriptionBusy}
                className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
                {inscriptionBusy ? "…" : t("etab.signup.submit")}
              </button>
              <button type="button" onClick={() => { setInscription(false); setInscriptionErreur(""); }}
                className="text-sm underline opacity-70">
                {t("etab.signup.cancel")}
              </button>
            </div>
            {inscriptionErreur && <p role="alert" className="text-sm text-red-400">{inscriptionErreur}</p>}
          </form>
        )}

        {/* --- Inscription faite --- */}
        {inscriptionFaite && (
          <div className="mt-8 rounded-lg border border-green-500/40 bg-green-500/10 p-4 text-left text-sm">
            <p className="font-bold">{t("etab.signup.doneTitle")}</p>
            <p className="mt-2 opacity-90">{t("etab.signup.done")}</p>
            {/* Répété APRÈS l'inscription : c'est maintenant que la question
                « et mes élèves, ils font comment ? » se pose vraiment. */}
            <p className="mt-2 opacity-90">{t("etab.signup.doneWallet")}</p>
            {/* Rechargement de la page plutôt que réémission du jeton : les
                rôles ne voyagent JAMAIS dans le jeton (src/server/token.ts),
                ils sont relus en base à chaque requête — celui du navigateur
                ouvre donc déjà la porte qui vient de s'installer. */}
            <button onClick={() => router.reload()}
              className="mt-4 rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90">
              {t("etab.signup.open")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const etab = data!.etablissement;
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-20 text-primary">
      <Head><title>{`${t("etab.title")} — EduChat`}</title></Head>

      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>{t("etab.demo.label")}</b> {t("etab.demo.text")}
        </p>
      )}
      {tour && <InterfaceTour parcours="etablissement" onClose={() => setTour(false)} />}

      <h1 data-tour="etab-identite" className="flex items-center gap-2 text-2xl font-bold"><MdSchool /> {demo ? t("etab.demo.school") : etab.name}</h1>
      <p className="mt-1 text-xs opacity-60"><Link href="/etablissements" className="underline">{t("etab.guide.link")}</Link> — {t("etab.guide.hint")}</p>
      <p className="mt-1 text-sm opacity-70">
        {t("etab.intro", { source: etab.ips ? t("etab.intro.ips") : t("etab.intro.network") })}
      </p>

      {/* --- Horaires d'accès libre --- */}
      <section data-tour="etab-horaires" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.hours.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.hours.help")}</p>
        <div className="mt-3 flex flex-col gap-2">
          {hours.length === 0 && <p className="text-sm opacity-50">{t("etab.hours.empty")}</p>}
          {hours.map((slot, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <select disabled={fige} value={slot.day} onChange={e => updateSlot(i, { day: Number(e.target.value) })}
                className="rounded bg-tertiary p-2">
                {DAY_KEYS.map((cle, di) => <option key={di} value={di}>{t(cle)}</option>)}
              </select>
              <span className="opacity-60">{t("etab.hours.from")}</span>
              <input disabled={fige} type="time" value={slot.start} onChange={e => updateSlot(i, { start: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <span className="opacity-60">{t("etab.hours.to")}</span>
              <input disabled={fige} type="time" value={slot.end} onChange={e => updateSlot(i, { end: e.target.value })}
                className="rounded bg-tertiary p-2" />
              <button disabled={fige} onClick={() => removeSlot(i)} aria-label={t("etab.hours.remove")}
                className="rounded p-2 text-red-400 hover:bg-red-500/10"><MdDelete /></button>
            </div>
          ))}
          <button disabled={fige} onClick={addSlot}
            className="flex w-fit items-center gap-1 rounded border border-white/20 px-3 py-1.5 text-sm hover:bg-tertiary">
            <MdAdd /> {t("etab.hours.add")}
          </button>
        </div>
      </section>

      {/* --- Limites de dépense --- */}
      <section data-tour="etab-quotas" className="mt-8">
        <h2 className="text-lg font-bold">{t("etab.quotas.title")}</h2>
        <p className="mt-1 text-sm opacity-70">{t("etab.quotas.help")}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.perStudent")}
            <input disabled={fige} value={perStudent} onChange={e => setPerStudent(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.perStudentPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.perStudentHint")}</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("etab.quotas.monthly")}
            <input disabled={fige} value={monthly} onChange={e => setMonthly(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric" placeholder={t("etab.quotas.monthlyPlaceholder")} className="rounded bg-tertiary p-2" />
            <span className="text-xs opacity-50">{t("etab.quotas.monthlyHint")}</span>
          </label>
        </div>
      </section>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} disabled={fige}
          className="rounded bg-[#DC6521] px-5 py-2 font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? "…" : t("etab.save")}
        </button>
        {message && <span className="text-sm opacity-80">{message}</span>}
      </div>

      {/* --- Consommation du mois (lecture seule) --- */}
      <section data-tour="etab-conso" className="mt-10">
        <h2 className="text-lg font-bold">{t("etab.usage.title")}</h2>
        <p className="mt-1 text-sm opacity-80">
          {t("etab.usage.totalLabel")} <b>{formatTokens(data!.usage.monthTokens)}</b> {t("etab.usage.totalSuffix")}
        </p>
        {data!.usage.byProvider.length > 0 && (
          <table className="mt-2 w-full max-w-md text-left text-sm">
            <thead className="text-xs uppercase opacity-60"><tr><th className="py-1">{t("etab.usage.model")}</th><th className="text-right">{t("etab.usage.tokens")}</th></tr></thead>
            <tbody>
              {data!.usage.byProvider.map(p => (
                <tr key={p.provider} className="border-b border-white/5">
                  <td className="py-1">{p.provider}</td>
                  <td className="text-right">{p.tokens.toLocaleString("fr-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* --- Informations gérées par l'administration --- */}
      <section className="mt-10 rounded-lg border border-white/10 bg-secondary p-4 text-sm">
        <h2 className="font-bold">{t("etab.admin.title")}</h2>
        <ul className="mt-2 space-y-1 opacity-80">
          <li>{t("etab.admin.ips")} <span className="font-mono text-xs">{etab.ips || t("etab.admin.noIps")}</span></li>
          <li>{t("etab.admin.status")} {etab.respire ? t("etab.admin.statusRespire") : t("etab.admin.statusBilled")}</li>
        </ul>
        {/* La phrase portait une SECONDE adresse en dur (blanvillain@…), à un
            centimètre du bouton d'assistance qui en annonce une autre : deux
            guichets pour un même besoin, et l'un des deux finit par ne plus
            être relevé. Elle dit maintenant « écrivez-nous » sans nommer de
            boîte — le guichet unique est le bouton juste en dessous, et c'est
            /assistance qui détient l'adresse. */}
        <p className="mt-2 text-xs opacity-60">{t("etab.admin.contact")}</p>
      </section>

      {/* --- Contact / assistance ---
          Placé juste après le bloc « géré par l'administration » : c'est déjà
          l'endroit où la page renvoie vers des humains. Le bouton mène à une
          PAGE (et non à un panneau replié) parce que ce qu'elle contient —
          l'offre de serveur local — se transmet à une direction ou à un
          service informatique : il faut une adresse qu'on puisse coller dans
          un courriel et une page qui s'imprime. */}
      <section className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/assistance"
          className="flex items-center gap-2 rounded border border-[#DC6521]/60 px-4 py-2 font-bold hover:bg-[#DC6521]/10">
          <MdSupportAgent className="text-[#DC6521]" /> {t("assistance.button")}
        </Link>
        <span className="text-xs opacity-60">{t("assistance.buttonHint")}</span>
      </section>
    </div>
  );
}
