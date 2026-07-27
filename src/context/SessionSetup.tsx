import React, { useEffect, useState } from 'react';
import { MdSchool } from 'react-icons/md';
import { currentLocale } from '../i18n/useT';

type PromptOption = { name: string; description: string };

type Props = { onDone: () => void };

// Écran de réglages de session, présenté à l'enseignant juste après avoir
// ouvert la salle par mot de passe (étape 14) : il « déploie » un tuteur sur sa
// classe (pré-sélectionné pour tous les élèves de l'IP de l'établissement) et
// décide de la recherche web. « Passer » n'écrit rien.
//
// Cet écran hérité n'est pas encore traduit — d'où le français en dur. Ce qu'il
// dit doit néanmoins rester VRAI : le mot de passe ouvre la salle de l'école du
// réseau appelant, jamais « le site ».
export default function SessionSetup({ onDone }: Props) {
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [promptName, setPromptName] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/prompts?sort=uses&locale=${currentLocale()}`)
      .then(r => r.json())
      .then(data => setPrompts((data.prompts ?? []).map((p: any) => ({ name: p.name, description: p.description }))))
      .catch(() => {});
  }, []);

  const apply = async () => {
    setBusy(true); setError('');
    const response = await fetch('/api/session-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptName, webSearch }),
    });
    setBusy(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      // « Le site est tout de même déverrouillé » n'était plus vrai : ce n'est
      // pas le SITE qui s'ouvre mais la SALLE de l'école du réseau appelant.
      setError(data?.error?.code === 'ERR_NO_ETABLISSEMENT'
        ? "Cette IP n'est rattachée à aucun établissement : les réglages de session ne s'appliquent pas ici (l'accès reste ouvert pour la salle)."
        : "Les réglages n'ont pas pu être enregistrés (l'accès reste ouvert pour la salle).");
      return;
    }
    onDone();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary p-4 text-primary">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-secondary p-6">
        <h2 className="flex items-center gap-2 text-xl font-bold"><MdSchool /> Salle ouverte</h2>
        <p className="mt-2 text-sm opacity-80">
          Réglages pour les élèves connectés depuis le réseau de votre établissement,
          le temps de la séance :
        </p>

        <label className="mt-4 flex flex-col gap-1 text-sm">
          Tuteur socratique proposé par défaut
          <select value={promptName} onChange={e => setPromptName(e.target.value)} className="rounded bg-tertiary p-2">
            <option value="">(aucun — chat libre)</option>
            {prompts.map(p => <option key={p.name} value={p.name}>{p.name} — {p.description.slice(0, 60)}</option>)}
          </select>
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={webSearch} onChange={e => setWebSearch(e.target.checked)} />
          Autoriser la recherche web pendant la session
        </label>

        <div className="mt-5 flex gap-2">
          <button onClick={apply} disabled={busy}
            className="flex-grow rounded bg-[#DC6521] px-4 py-2 font-bold hover:opacity-90 disabled:opacity-50">
            {busy ? '…' : 'Appliquer à ma classe'}
          </button>
          <button onClick={onDone} className="rounded border border-white/20 px-4 py-2 text-sm hover:bg-tertiary">
            Passer
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <p className="mt-4 border-t border-white/10 pt-3 text-xs opacity-60">
          Responsable de l'établissement ? Réglez horaires et budgets sur{" "}
          <a href="/etablissement" className="underline">votre page dédiée</a>.
        </p>
      </div>
    </div>
  );
}
