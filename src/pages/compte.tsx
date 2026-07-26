import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n/useT";
import { authHeaders, getAccount, storeToken } from "../utils/account";
import { buildProfile } from "../utils/profile";
import { deleteServerConversations, deleteServerProfile } from "../utils/profileSync";
import { providerDefaults } from "../shared/providers";
import { useRouter } from "next/router";
import InterfaceTour from "../chat/InterfaceTour";
import { useListe, useListeSeule } from "../site/ListePaginee";
import type { AccountData } from "../server/accountData";

// Dossier FICTIF de la visite guidée : de quoi montrer chaque section — dont
// celles réservées à un enseignant ou à un promptagogue — sans emprunter les
// données de personne.
const DOSSIER_DEMO: AccountData = {
  identite: {
    email: "claire.martin@example.org", name: "claire.martin",
    createdAt: Date.parse("2026-02-14T09:00:00Z"), verifiedAt: Date.parse("2026-07-20T08:30:00Z"),
    isPromptagogue: true, isTeacher: true, isAdmin: false, syncOptin: true, keysOptin: true,
  },
  consommation: {
    declaredTokens: 128400, profileUpdatedAt: Date.parse("2026-07-25T17:10:00Z"),
    quota: { usedBytes: 8420, maxBytes: 1048576 },
    teacherPilotedTokens: 96300,
    etablissement: { id: 1, name: "Collège de la Démonstration", monthTokens: 412350 },
  },
  keys: [{ provider: "mistral", updatedAt: Date.parse("2026-07-22T14:05:00Z"), readable: true }],
  moderations: 3,
  conversations: [
    { id: "d1", name: "Théorème de Pythagore", createdAt: 1784100000000, lastMessage: 1784900000000, messageCount: 14, promptName: "Socrate", promptVersion: 3, bytes: 8210 },
    { id: "d2", name: "Révolution française", createdAt: 1784200000000, lastMessage: 1784800000000, messageCount: 6, promptName: "Montaigne", promptVersion: 1, bytes: 3140 },
  ],
  deletedConversations: 1,
  prompts: [
    { id: 7, name: "Ératosthène", description: "Mesurer la Terre par le questionnement.", status: "published", archived: false, version: 2, usageCount: 143, tokensTotal: 51200, ratingCount: 9, sizeBytes: 4210, createdAt: 1783000000000, updatedAt: 1784500000000 },
  ],
  anonymousPromptsWarning: true,
};

// « Mes données » — ce que le serveur conserve d'un compte, et de quoi le
// reprendre en main : tout exporter, effacer ce qui peut l'être.
//
// L'ordre des sections est celui de la demande : la consommation d'abord,
// les clés ensuite, les conversations en tableau, le reste à la fin.
//
// Deux honnêtetés structurent la page :
//  - on n'affiche aucun chiffre inventé. EduChat ne journalise PAS l'usage
//    d'une clé personnelle : la consommation « personnelle » n'existe pas
//    côté serveur, et la page le dit plutôt que d'afficher un zéro ;
//  - un tuteur publié n'est jamais supprimé. Il se dépublie (réversible) :
//    une fois paru au catalogue il appartient au domaine public, et ses
//    compteurs doivent rester calculables.

const CARTE = "rounded-lg border border-white/10 bg-secondary p-4";
const BOUTON = "rounded border border-white/20 px-3 py-1.5 text-xs text-primary hover:bg-tertiary disabled:opacity-40";
const DANGER = "rounded border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40";

function octets(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

function Section({ numero, titre, ancre, barre, children }: {
  numero: number; titre: string; ancre?: string; barre?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section data-tour={ancre} className="mt-6">
      <h2 className="mb-2 flex flex-wrap items-baseline gap-2 text-lg font-bold">
        <span className="text-sm opacity-50">{numero}.</span>{titre}{barre}
      </h2>
      <div className={CARTE}>{children}</div>
    </section>
  );
}

export default function ComptePage() {
  const t = useT();
  const [state, setState] = useState<"loading" | "anonymous" | "ready">("loading");
  const [data, setData] = useState<AccountData | null>(null);
  const [choisies, setChoisies] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  // Vrai quand le dernier rafraîchissement a échoué : les données affichées
  // sont alors celles d'avant, et il faut le dire.
  const [echec, setEchec] = useState(false);
  const [busy, setBusy] = useState(false);
  // Identité : nom d'affichage et adresse. Le nom n'est plus demandé à la
  // vérification (il vient de la partie locale de l'adresse) : c'est ici
  // qu'on le personnalise.
  const [nom, setNom] = useState("");
  const [nouvelEmail, setNouvelEmail] = useState("");
  const [codeEmail, setCodeEmail] = useState("");
  const [attenteCode, setAttenteCode] = useState(false);

  // DÉMONSTRATION (?visite=1) : la page s'ouvre sans compte, avec un dossier
  // FICTIF, pour montrer ce que chaque profil y trouve. Aucun appel serveur.
  const router = useRouter();
  const demo = router.isReady && router.query.visite === "1";
  const [tour, setTour] = useState(false);
  useEffect(() => { if (demo) setTour(true); }, [demo]);

  // Huit conversations par page ; « Tout voir » rouvre la page sur cette
  // seule liste, entière, avec recherche et tri.
  const seule = useListeSeule();
  const listeConv = useListe("conversations", data?.conversations ?? [], {
    cherchable: c => `${c.name} ${c.promptName}`,
    tris: [
      { cle: "recent", label: t("compte.conv.sortRecent"), compare: (a, b) => (b.lastMessage || b.createdAt) - (a.lastMessage || a.createdAt) },
      { cle: "nom", label: t("compte.conv.sortName"), compare: (a, b) => a.name.localeCompare(b.name) },
      { cle: "taille", label: t("compte.conv.sortSize"), compare: (a, b) => b.bytes - a.bytes },
    ],
  });

  const charger = useCallback(async () => {
    // Le jeton local ne prouve rien (il n'est pas vérifié côté navigateur) :
    // c'est la réponse du serveur qui décide de l'état de la page.
    //
    // Mais SEUL un 401 signifie « pas identifié ». Un 429 ou une coupure de
    // réseau afficheraient sinon « identifiez-vous » à quelqu'un qui l'est —
    // et effaceraient sous ses yeux le compte rendu de l'action qui vient de
    // réussir.
    try {
      const response = await fetch("/api/me/data", { headers: authHeaders() });
      if (response.status === 401) { setData(null); setState("anonymous"); return; }
      if (!response.ok) { setEchec(true); setState(avant => (avant === "loading" ? "anonymous" : avant)); return; }
      const recu = await response.json();
      setData(recu);
      setNom(recu?.identite?.name ?? "");
      setEchec(false);
      setState("ready");
    } catch {
      setEchec(true);
      setState(avant => (avant === "loading" ? "anonymous" : avant));
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (demo) {
      setData(DOSSIER_DEMO);
      setNom(DOSSIER_DEMO.identite.name);
      setState("ready");
      return;
    }
    // Un effacement recharge la page (voir rafraichirTout) : le compte rendu
    // doit lui survivre, sans quoi l'utilisateur ne saurait pas que c'est
    // fait.
    const garde = sessionStorage.getItem("educhat-compte-message");
    if (garde) { setMessage(garde); sessionStorage.removeItem("educhat-compte-message"); }
    if (!getAccount()) { setState("anonymous"); return; }
    void charger();
  }, [charger, router.isReady, demo]);

  /**
   * Rechargement complet après un effacement. Le contexte du chat garde en
   * mémoire la liste des conversations, lue une seule fois au démarrage : sans
   * cela, l'historique continuerait d'afficher une conversation effacée, et
   * cliquer dessus renverrait sur une page vide.
   */
  const rafraichirTout = (compteRendu: string) => {
    sessionStorage.setItem("educhat-compte-message", compteRendu);
    window.location.reload();
  };

  const agir = async (action: () => Promise<boolean | void>, succes: string) => {
    setBusy(true); setMessage("");
    try {
      const resultat = await action();
      setMessage(resultat === false ? t("compte.error") : succes);
      await charger();
    } catch {
      setMessage(t("compte.error"));
    } finally {
      setBusy(false);
    }
  };

  // Export intégral = ce que garde le serveur ET ce que garde CE navigateur.
  // Un export serveur seul porterait mal son nom pour qui n'a jamais
  // synchronisé.
  const exporter = () => agir(async () => {
    const response = await fetch("/api/me/export", { headers: authHeaders() });
    if (!response.ok) return false;
    const contenu = { ...(await response.json()), navigateurLocal: buildProfile() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" }));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = "educhat-mes-donnees.json";
    lien.click();
    URL.revokeObjectURL(url);
  }, t("compte.exported"));

  const oublierCle = (provider: string) => agir(async () => {
    const response = await fetch(`/api/keys?provider=${encodeURIComponent(provider)}`,
      { method: "DELETE", headers: authHeaders() });
    return response.ok;
  }, t("compte.keys.forgotten"));

  const retirerConsentementCles = () => {
    if (!window.confirm(t("compte.keys.optoutConfirm"))) return;
    void agir(async () => {
      const response = await fetch("/api/keys", {
        method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ optin: false }),
      });
      return response.ok;
    }, t("compte.keys.forgotten"));
  };

  const supprimerChoisies = () => {
    if (!choisies.length || !window.confirm(t("compte.conv.confirm").replace("{n}", String(choisies.length)))) return;
    void agir(async () => {
      const ok = await deleteServerConversations(choisies);
      if (!ok) return false;
      rafraichirTout(t("compte.conv.deleted"));
    }, t("compte.conv.deleted"));
  };

  const toutSupprimer = () => {
    if (!window.confirm(t("compte.conv.deleteAllConfirm"))) return;
    void agir(async () => {
      const ok = await deleteServerProfile();
      if (!ok) return false;
      rafraichirTout(t("compte.conv.deletedAll"));
    }, t("compte.conv.deletedAll"));
  };

  const enregistrerNom = () => agir(async () => {
    const response = await fetch("/api/me", {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: nom }),
    });
    return response.ok;
  }, t("compte.identity.nameSaved"));

  const demanderChangementEmail = () => agir(async () => {
    const response = await fetch("/api/me/email", {
      method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ newEmail: nouvelEmail.trim() }),
    });
    if (!response.ok) return false;
    setAttenteCode(true);
    return true;
  }, t("compte.identity.codeSent"));

  const confirmerChangementEmail = () => agir(async () => {
    const response = await fetch("/api/me/email", {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ code: codeEmail.trim() }),
    });
    if (!response.ok) return false;
    // Le jeton portait l'ancienne adresse : sans ce remplacement, la personne
    // serait déconnectée d'un compte qui existe pourtant toujours.
    const data = await response.json();
    if (data?.token) storeToken(data.token);
    setAttenteCode(false); setNouvelEmail(""); setCodeEmail("");
    rafraichirTout(t("compte.identity.emailChanged"));
  }, t("compte.identity.emailChanged"));

  const basculerSync = (valeur: boolean) => agir(async () => {
    const response = await fetch("/api/me", {
      method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ syncOptin: valeur }),
    });
    return response.ok;
  }, valeur ? t("compte.conv.syncOn") : t("compte.conv.syncOff"));

  const transitionner = (name: string, action: "retire" | "republish") => {
    if (action === "retire" && !window.confirm(t("compte.prompts.retireConfirm").replace("{name}", name))) return;
    void agir(async () => {
      const response = await fetch(`/api/prompts/${encodeURIComponent(name)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ action }),
      });
      return response.ok;
    }, action === "retire" ? t("compte.prompts.retired") : t("compte.prompts.republished"));
  };

  const date = (ms: number | null | undefined) =>
    ms ? new Date(ms).toLocaleString("fr-CH") : t("compte.unknownDate");

  if (state === "loading") {
    return <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 text-primary">{t("compte.loading")}</main>;
  }

  if (state === "anonymous" || !data) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 text-primary">
        <Head><title>{`${t("compte.title")} — EduChat`}</title></Head>
        <h1 className="text-2xl font-bold">{t("compte.title")}</h1>
        <p className="mt-3 opacity-80">{t("compte.anonymous")}</p>
        <Link href="/verifier" className="mt-4 inline-block rounded bg-[#DC6521] px-4 py-2 font-bold text-[#111827] hover:opacity-90">
          {t("compte.anonymousCta")}
        </Link>
      </main>
    );
  }

  const { identite, consommation, keys, conversations, prompts } = data;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6 text-primary">
      <Head><title>{`${t("compte.title")} — EduChat`}</title></Head>

      {!seule && (<>
      {demo && (
        <p className="mb-4 rounded-lg border border-[#DC6521]/50 bg-[#DC6521]/10 p-3 text-sm">
          <b>Démonstration.</b> Voici « Mes données » telle que la voit une enseignante qui
          publie aussi des tuteurs — avec un dossier fictif. Chaque section montre ce qu&apos;un
          profil y trouve : un apprenant n&apos;aura ni tuteurs ni séances de classe, un
          promptagogue n&apos;aura pas d&apos;établissement.
        </p>
      )}
      {tour && <InterfaceTour parcours="compte" onClose={() => setTour(false)} />}

      <div data-tour="compte-export" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("compte.title")}</h1>
          <p className="mt-1 text-sm opacity-70">{identite.name} · {identite.email}</p>
        </div>
        {/* Pour l'administration, la première action n'est pas d'exporter ses
            propres données — c'est d'administrer. L'export reste accessible,
            en second. */}
        {identite.isAdmin ? (
          <div className="flex items-center gap-2">
            <Link href="/admin"
              className="rounded bg-[#DC6521] px-4 py-2 text-sm font-bold text-[#111827] hover:opacity-90">
              {t("compte.administer")}
            </Link>
            <button onClick={() => void exporter()} disabled={busy} className={BOUTON}>
              {t("compte.exportAll")}
            </button>
          </div>
        ) : (
          <button onClick={() => void exporter()} disabled={busy}
            className="rounded bg-[#DC6521] px-4 py-2 text-sm font-bold text-[#111827] hover:opacity-90 disabled:opacity-50">
            {t("compte.exportAll")}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs opacity-60">{t("compte.subtitle")}</p>
      {message && <p role="status" className="mt-3 rounded bg-tertiary px-3 py-2 text-sm">{message}</p>}
      {echec && (
        <p role="alert" className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t("compte.stale")}{" "}
          <button onClick={() => void charger()} className="underline">{t("compte.retry")}</button>
        </p>
      )}
      </>)}

      {/* 1 — Consommation ------------------------------------------------ */}
      {!seule && (
      <Section ancre="compte-conso" numero={1} titre={t("compte.usage.title")}>
        <p className="text-sm opacity-80">{t("compte.usage.notMeasured")}</p>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase opacity-60">{t("compte.usage.declared")}</dt>
            <dd className="text-lg font-bold">
              {consommation.declaredTokens === null
                ? <span className="text-sm font-normal opacity-70">{t("compte.usage.noProfile")}</span>
                : consommation.declaredTokens.toLocaleString("fr-CH")}
            </dd>
            <p className="text-xs opacity-60">{t("compte.usage.declaredHint")}</p>
          </div>
          <div>
            <dt className="text-xs uppercase opacity-60">{t("compte.usage.quota")}</dt>
            <dd className="text-lg font-bold">
              {octets(consommation.quota.usedBytes)}
              <span className="text-sm font-normal opacity-60"> / {octets(consommation.quota.maxBytes)}</span>
            </dd>
            <p className="text-xs opacity-60">{t("compte.usage.quotaHint")}</p>
          </div>
          {consommation.teacherPilotedTokens !== null && (
            <div>
              <dt className="text-xs uppercase opacity-60">{t("compte.usage.teacher")}</dt>
              <dd className="text-lg font-bold">{consommation.teacherPilotedTokens.toLocaleString("fr-CH")}</dd>
              <p className="text-xs opacity-60">{t("compte.usage.teacherHint")}</p>
            </div>
          )}
          {consommation.etablissement && (
            <div>
              <dt className="text-xs uppercase opacity-60">{t("compte.usage.school")}</dt>
              <dd className="text-lg font-bold">
                {consommation.etablissement.monthTokens.toLocaleString("fr-CH")}
              </dd>
              <p className="text-xs opacity-60">
                {consommation.etablissement.name} — {t("compte.usage.schoolHint")}
              </p>
            </div>
          )}
        </dl>
      </Section>
      )}

      {/* 2 — Clés API ------------------------------------------------------ */}
      {!seule && (
      <Section ancre="compte-cles" numero={2} titre={t("compte.keys.title")}>
        <p className="text-sm opacity-80">{t("compte.keys.intro")}</p>
        {keys.length === 0
          ? <p className="mt-3 text-sm opacity-60">{t("compte.keys.none")}</p>
          : (
            <ul className="mt-3 divide-y divide-white/10">
              {keys.map(cle => (
                <li key={cle.provider} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm">
                    <b>{providerDefaults[cle.provider]?.label ?? cle.provider}</b>
                    <span className="opacity-60"> — {t("compte.keys.savedOn")} {date(cle.updatedAt)}</span>
                    {!cle.readable && <span className="ml-2 text-xs text-amber-300">{t("compte.keys.unreadable")}</span>}
                  </span>
                  <button onClick={() => void oublierCle(cle.provider)} disabled={busy} className={DANGER}>
                    {t("compte.keys.forget")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        {identite.keysOptin && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
            <span className="text-xs opacity-70">{t("compte.keys.optinOn")}</span>
            <button onClick={retirerConsentementCles} disabled={busy} className={DANGER}>
              {t("compte.keys.optout")}
            </button>
          </div>
        )}
      </Section>
      )}

      {/* 3 — Conversations -------------------------------------------------- */}
      {(!seule || seule === "conversations") && (
      <Section ancre="compte-conversations" numero={3} titre={t("compte.conv.title")} barre={listeConv.barre}>
        <p className="text-sm opacity-80">{t("compte.conv.intro")}</p>

        <label className="mt-3 flex items-center gap-2 text-xs">
          <input type="checkbox" checked={identite.syncOptin} disabled={busy}
            onChange={event => void basculerSync(event.target.checked)} />
          <span>{t("compte.conv.sync")}</span>
        </label>

        {conversations.length === 0
          ? <p className="mt-3 text-sm opacity-60">{t("compte.conv.none")}</p>
          : (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="uppercase opacity-60">
                    <tr>
                      <th className="w-8 py-1"><span className="sr-only">{t("compte.conv.select")}</span></th>
                      <th className="py-1 pr-2">{t("compte.conv.name")}</th>
                      <th className="pr-2">{t("compte.conv.tutor")}</th>
                      <th className="pr-2">{t("compte.conv.messages")}</th>
                      <th className="pr-2">{t("compte.conv.updated")}</th>
                      <th>{t("compte.conv.size")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listeConv.visibles.map(conversation => (
                      <tr key={conversation.id} className="border-b border-white/5">
                        <td className="py-1.5">
                          <input type="checkbox" checked={choisies.includes(conversation.id)}
                            aria-label={conversation.name || t("compte.conv.untitled")}
                            onChange={event => setChoisies(avant => event.target.checked
                              ? [...avant, conversation.id]
                              : avant.filter(id => id !== conversation.id))} />
                        </td>
                        <td className="py-1.5 pr-2">{conversation.name || <i className="opacity-60">{t("compte.conv.untitled")}</i>}</td>
                        <td className="pr-2 opacity-80">
                          {conversation.promptName
                            ? `${conversation.promptName}${conversation.promptVersion ? ` v${conversation.promptVersion}` : ""}`
                            : "—"}
                        </td>
                        <td className="pr-2 opacity-80">{conversation.messageCount}</td>
                        <td className="pr-2 opacity-80">{date(conversation.lastMessage || conversation.createdAt)}</td>
                        <td className="opacity-80">{octets(conversation.bytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button onClick={supprimerChoisies} disabled={busy || !choisies.length} className={DANGER}>
                  {t("compte.conv.deleteSelected").replace("{n}", String(choisies.length))}
                </button>
                <span className="text-xs opacity-60">{t("compte.conv.deleteHint")}</span>
              </div>
            </>
          )}
        {/* Hors du tableau : effacer la DERNIÈRE conversation ne doit pas
            emporter le seul bouton capable de supprimer ce qui reste du
            profil (favoris, notes, compteur de jetons). */}
        {consommation.profileUpdatedAt !== null && (
          <div className="mt-3 border-t border-white/10 pt-3">
            <button onClick={toutSupprimer} disabled={busy} className={DANGER}>
              {t("compte.conv.deleteAll")}
            </button>
          </div>
        )}
        {data.deletedConversations > 0 && (
          <p className="mt-3 text-xs opacity-60">
            {t("compte.conv.tombstones").replace("{n}", String(data.deletedConversations))}
          </p>
        )}
      </Section>
      )}

      {/* 4 — Le reste -------------------------------------------------------- */}
      {!seule && (
      <Section ancre="compte-tuteurs" numero={4} titre={t("compte.other.title")}>
        <h3 className="text-sm font-bold">{t("compte.prompts.title")}</h3>
        <p className="mt-1 text-xs opacity-70">{t("compte.prompts.publicDomain")}</p>
        {prompts.length === 0
          ? <p className="mt-2 text-sm opacity-60">{t("compte.prompts.none")}</p>
          : (
            <ul className="mt-2 divide-y divide-white/10">
              {prompts.map(prompt => (
                <li key={prompt.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${prompt.archived ? "opacity-50" : ""}`}>
                  <span className="text-sm">
                    <b>{prompt.name}</b>
                    <span className="opacity-60"> — {t(`compte.prompts.status.${prompt.status}` as any)}
                      {prompt.archived ? ` · ${t("compte.prompts.archived")}` : ""}
                      {` · v${prompt.version} · ${prompt.usageCount} ${t("compte.prompts.uses")}`}
                      {` · ${prompt.tokensTotal.toLocaleString("fr-CH")} ${t("compte.prompts.tokens")}`}
                    </span>
                  </span>
                  {!prompt.archived && prompt.status === "published" && (
                    <button onClick={() => transitionner(prompt.name, "retire")} disabled={busy} className={BOUTON}>
                      {t("compte.prompts.retire")}
                    </button>
                  )}
                  {!prompt.archived && prompt.status === "retired" && (
                    <button onClick={() => transitionner(prompt.name, "republish")} disabled={busy} className={BOUTON}>
                      {t("compte.prompts.republish")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        {data.anonymousPromptsWarning && (
          <p className="mt-2 text-xs opacity-60">{t("compte.prompts.anonymous")}</p>
        )}

        <h3 data-tour="compte-identite" className="mt-5 text-sm font-bold">{t("compte.identity.title")}</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {t("compte.identity.name")}
            <input value={nom} onChange={event => setNom(event.target.value)} maxLength={80}
              placeholder={identite.email.split("@")[0]}
              className="w-56 rounded bg-tertiary px-2 py-1 text-sm" />
          </label>
          <button onClick={() => void enregistrerNom()} disabled={busy} className={BOUTON}>
            {t("compte.identity.save")}
          </button>
          <span className="text-xs opacity-60">{t("compte.identity.nameHint")}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            {t("compte.identity.email")}
            <input value={nouvelEmail} onChange={event => setNouvelEmail(event.target.value)}
              type="email" placeholder={identite.email} autoComplete="email"
              className="w-72 rounded bg-tertiary px-2 py-1 text-sm" />
          </label>
          <button onClick={() => void demanderChangementEmail()}
            disabled={busy || !nouvelEmail.trim()} className={BOUTON}>
            {t("compte.identity.emailRequest")}
          </button>
        </div>
        {attenteCode && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              {t("compte.identity.code")}
              <input value={codeEmail} onChange={event => setCodeEmail(event.target.value)}
                inputMode="numeric" placeholder="123-456"
                className="w-32 rounded bg-tertiary px-2 py-1 text-sm" />
            </label>
            <button onClick={() => void confirmerChangementEmail()} disabled={busy || !codeEmail.trim()} className={BOUTON}>
              {t("compte.identity.confirm")}
            </button>
          </div>
        )}
        <p className="mt-2 text-xs opacity-60">{t("compte.identity.emailHint")}</p>

        <h3 className="mt-5 text-sm font-bold">{t("compte.other.account")}</h3>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs uppercase opacity-60">{t("compte.other.roles")}</dt>
            <dd>{[
              identite.isPromptagogue && t("compte.other.promptagogue"),
              identite.isTeacher && t("compte.other.teacher"),
              identite.isAdmin && t("compte.other.admin"),
            ].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt className="text-xs uppercase opacity-60">{t("compte.other.school")}</dt>
            <dd>{consommation.etablissement?.name ?? t("compte.other.noSchool")}</dd></div>
          <div><dt className="text-xs uppercase opacity-60">{t("compte.other.created")}</dt>
            <dd>{date(identite.createdAt)}</dd></div>
          <div><dt className="text-xs uppercase opacity-60">{t("compte.other.verified")}</dt>
            <dd>{date(identite.verifiedAt)}</dd></div>
          <div><dt className="text-xs uppercase opacity-60">{t("compte.other.moderations")}</dt>
            <dd>{data.moderations}</dd>
            <p className="text-xs opacity-60">{t("compte.other.moderationsHint")}</p></div>
        </dl>
        <p className="mt-3 text-xs opacity-60">{t("compte.other.rest")}</p>
      </Section>
      )}

      <p className="mt-6 text-xs opacity-60">
        {t("compte.footer")} <Link href="/rgpd" className="underline">{t("common.privacy")}</Link>.
      </p>
    </main>
  );
}
