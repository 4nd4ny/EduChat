import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { getAccount, authHeaders } from "../utils/account";
import { useT } from "../i18n/useT";
import type { TranslationKey } from "../i18n/dictionaries";

// Les codes d'erreur du serveur sont un contrat technique : ils ne se
// traduisent pas. Seule la phrase montrée à l'auteur passe par le
// dictionnaire — cette table fait la jonction entre les deux.
const ERROR_KEYS: Record<string, TranslationKey> = {
  ERR_NAME_INVALID: "publier.err.nameInvalid",
  ERR_NAME_TAKEN: "publier.err.nameTaken",
  ERR_BODY_TOO_SHORT: "publier.err.bodyTooShort",
  ERR_BODY_TOO_LARGE: "publier.err.bodyTooLarge",
  ERR_QUOTA_USER: "publier.err.quotaUser",
  ERR_RATE_LIMIT: "publier.err.rateLimit",
};

// Publier = créer un brouillon « en construction », testable et partageable
// par URL secrète, puis le soumettre à validation. Ouvert à tous : signé
// (compte vérifié) ou anonyme (validé et géré par l'admin uniquement).
export default function PublierPage() {
  const router = useRouter();
  const t = useT();
  const account = typeof window !== "undefined" ? getAccount() : null;

  const [name, setName] = useState("");
  // La langue du tuteur suit celle de la page. Le gabarit socratique proposé
  // est déjà traduit : le laisser à « fr » en dur faisait enregistrer un texte
  // italien étiqueté français — et la traduction automatique visait ensuite les
  // trois mauvaises langues, en retraduisant l'italien vers l'italien.
  const [language, setLanguage] = useState(router.locale ?? "fr");
  const [description, setDescription] = useState("");
  // Gabarit socratique guidé : abaisse la barrière d'entrée et homogénéise la
  // qualité du catalogue. Il vit dans le dictionnaire (publier.template) et
  // suit donc la langue du lecteur ; les balises <thinking> et <encouragement>
  // y restent littérales dans les quatre langues — le rendu du chat les
  // reconnaît par leur nom. [EXEMPLES À INTÉGRER : le client fournira ses
  // propres exemples de prompts socratiques pour enrichir ce gabarit.]
  const [body, setBody] = useState(() => t("publier.template"));
  // Le gabarit doit SUIVRE la langue du lecteur tant que l'auteur n'y a pas
  // touché. Changer de langue depuis l'en-tête est un router.push sur la même
  // route : la page n'est pas démontée, l'initialiseur de useState ci-dessus
  // ne rejoue donc jamais et le gabarit resterait figé dans la langue
  // d'arrivée — une zone de texte française sur une page italienne. Dès la
  // première frappe, ou dès qu'une variante préremplit le champ, le texte
  // appartient à l'auteur et plus rien ne l'écrase.
  const [bodyTouched, setBodyTouched] = useState(false);
  useEffect(() => {
    if (!bodyTouched) setBody(t("publier.template"));
  }, [t, bodyTouched]);
  const [webSearch, setWebSearch] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Filiation : nom du tuteur source quand on arrive par « proposer une
  // variante » — stockée en métadonnée du nouveau prompt (affiliation).
  const [inspiredBy, setInspiredBy] = useState("");

  // Sans compte vérifié, la publication est nécessairement anonyme.
  useEffect(() => {
    if (!account) setAnonymous(true);
  }, [account?.email]);

  // « Proposer une variante » : personnalisation d'un tuteur existant
  // (fonctionnalité pivot v3 : éditer, personnaliser — ouverte à tous).
  //
  // La fiche source est demandée SANS « ?locale= », volontairement : on part
  // du texte ORIGINAL de l'auteur, jamais de sa traduction machine. Le nom
  // reçu est le nom canonique — c'est une identité (adresse /p/nom, valeur
  // envoyée au serveur), il n'est pas traduit. Seule l'amorce de description
  // qui l'enrobe suit la langue du lecteur.
  useEffect(() => {
    if (!router.isReady) return;
    const source = typeof router.query.variante === "string" ? router.query.variante : "";
    if (!source) return;
    fetch(`/api/prompts/${encodeURIComponent(source)}`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => {
        setBody(data.prompt.body); setBodyTouched(true);
        setDescription(t("publier.variante.descriptionPrefill", {
          name: data.prompt.name, description: data.prompt.description,
        }).slice(0, 500));
        setLanguage(data.prompt.language);
        setInspiredBy(data.prompt.name);
      })
      .catch(() => {});
    // « t » est volontairement hors dépendances : changer de langue en cours
    // de rédaction ne doit pas relancer la requête ni écraser la saisie.
  }, [router.isReady, router.query.variante]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!anonymous) Object.assign(headers, authHeaders());
    const response = await fetch("/api/prompts", {
      method: "POST", headers,
      body: JSON.stringify({ name, language, description, body, webSearch, ...(inspiredBy ? { inspiredBy } : {}) }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(t(ERROR_KEYS[data?.error?.code] || "publier.err.generic"));
      return;
    }
    router.push(`/p/essai/${data.shareToken}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 pb-16 text-primary">
      <Head><title>{`${t("publier.headTitle")} — EduChat`}</title></Head>

      <h1 className="text-2xl font-bold">{t("publier.title")}</h1>
      {inspiredBy && (
        <p className="mt-2 rounded border border-[#DC6521]/40 bg-[#DC6521]/10 p-2 text-sm">
          {t("publier.variante.inspiredBy")}{" "}
          <Link className="font-bold underline" href={`/p/${encodeURIComponent(inspiredBy)}`}>{inspiredBy}</Link>
          {" "}— {t("publier.variante.lineage")}
        </p>
      )}
      <p className="mt-2 text-sm opacity-80">
        {t("publier.intro")}{" "}
        <Link href="/tutoriel#promptagogues" className="underline">{t("publier.introGuide")}</Link>.
      </p>

      {/* Le point de non-retour. Il valait mieux le dire ici que de le
          découvrir en cherchant un bouton « supprimer » qui n'existe pas.
          Le paragraphe est découpé parce que trois fragments sont en gras :
          l'espace qui sépare deux fragments appartient au fragment qui suit
          (le français met une espace avant « : », l'anglais non). */}
      <p className="mt-3 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <b>{t("publier.warning.headline")}</b> {t("publier.warning.beforeDomain")}{" "}
        <b>{t("publier.warning.publicDomain")}</b>{t("publier.warning.afterDomain")}{" "}
        <b>{t("publier.warning.unpublish")}</b>{t("publier.warning.afterUnpublish")}{" "}
        <Link href="/compte" className="underline">{t("compte.title")}</Link>
        {t("publier.warning.anonymous")}
      </p>

      {/* Une conséquence de la publication que l'auteur doit connaître AVANT
          d'écrire : son texte sera relu par des lecteurs dans trois langues
          qu'il n'a pas choisies. */}
      <p className="mt-3 text-sm opacity-80">
        <b>{t("publier.translated.headline")}</b> {t("publier.translated.body")}
      </p>

      <div className="mt-4 rounded border border-white/10 bg-secondary p-3 text-sm">
        {account ? (
          <>{t("publier.author.signedAs")} <b>{account.name || account.email}</b>.{" "}
            <label className="ml-2"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} /> {t("publier.author.anonCheckbox")}</label>
            {anonymous && <span className="block pt-1 text-xs opacity-70">{t("publier.author.anonHint")}</span>}
          </>
        ) : (
          <>{t("publier.author.youPublish")} <b>{t("publier.author.anonymously")}</b>{t("publier.author.anonNotice")}{" "}
            <Link href="/verifier" className="underline">{t("publier.author.verifyLink")}</Link> — {t("publier.author.verifyHint")}
          </>
        )}
      </div>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">{t("publier.form.name")}
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={64}
              placeholder={t("publier.form.namePlaceholder")} className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1 text-sm">{t("publier.form.language")}
            {/* Les quatre libellés sont des endonymes : chaque langue se nomme
                elle-même, dans toutes les langues. Ils passent quand même par
                le dictionnaire — une chaîne littérale ici serait relue comme
                un oubli de traduction. La valeur de <option>, elle, est le
                code de langue envoyé au serveur : il ne bouge pas. */}
            <select value={language} onChange={e => setLanguage(e.target.value)} className="rounded bg-tertiary p-2">
              <option value="fr">{t("publier.lang.fr")}</option><option value="en">{t("publier.lang.en")}</option>
              <option value="it">{t("publier.lang.it")}</option><option value="de">{t("publier.lang.de")}</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">{t("publier.form.description")}
          <input value={description} onChange={e => setDescription(e.target.value)} required maxLength={500}
            placeholder={t("publier.form.descriptionPlaceholder")}
            className="rounded bg-tertiary p-2" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("publier.form.body")}
          <textarea value={body} onChange={e => { setBody(e.target.value); setBodyTouched(true); }} required rows={18}
            className="rounded bg-tertiary p-3 font-mono text-sm leading-relaxed" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
          {t("publier.form.webSearch")}
        </label>
        <button type="submit" disabled={busy}
          className="rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
          {busy ? t("publier.form.creating") : t("publier.form.submit")}
        </button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  );
}
