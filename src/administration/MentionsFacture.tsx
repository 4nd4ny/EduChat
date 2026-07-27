import Link from "next/link";
import React, { useState } from "react";
import { MdPrint } from "react-icons/md";
import { useT } from "../i18n/useT";
import { authHeaders } from "../utils/account";
import type { FactureRow } from "./commun";

// CE QU'UNE ÉCOLE AJOUTE À SA FACTURE POUR POUVOIR LA PAYER.
//
// Une facture juste ne suffit pas : encore faut-il qu'elle parvienne au bon
// service, sous la référence par laquelle la dépense a été engagée. Ces trois
// champs sont donc les seuls que l'administrateur d'une école écrit lui-même
// sur un document de facturation — et ils n'entrent dans AUCUN calcul. La
// phrase sous le formulaire le dit à l'école plutôt que de la laisser
// soupçonner qu'une note libre puisse déplacer un total.
//
// COMPOSANT AUTONOME, dans src/administration/ : la répartition par niveau
// (décision A) fera descendre la facture de /admin vers /etablissement, et ce
// bloc doit suivre sans être réécrit. Il ne connaît que sa facture, son
// rafraîchissement, et rien de la page qui l'accueille.
export function MentionsFacture({ facture, onSaved }: {
  facture: FactureRow;
  /** Rafraîchir la liste appelante : le serveur renvoie les mentions bornées. */
  onSaved?: () => void;
}) {
  const t = useT();
  const [ouvert, setOuvert] = useState(false);
  const [adresse, setAdresse] = useState(facture.mentions?.adresse ?? "");
  const [reference, setReference] = useState(facture.mentions?.reference ?? "");
  const [note, setNote] = useState(facture.mentions?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const enregistrer = async () => {
    setBusy(true); setMessage("");
    const r = await fetch("/api/admin/factures", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        action: "mentions", etablissementId: facture.etablissementId,
        periode: facture.periode, adresse, reference, note,
      }),
    }).catch(() => null);
    setBusy(false);
    setMessage(r?.ok ? t("facture.mentions.saved") : t("facture.mentions.failed"));
    if (r?.ok) onSaved?.();
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button onClick={() => setOuvert(!ouvert)} className="underline opacity-80 hover:opacity-100">
          {ouvert ? t("facture.mentions.close") : t("facture.mentions.open")}
        </button>
        {/* L'IMPRESSION EST UNE PAGE, pas une fenêtre surgissante : le document
            se transmet, se relit, se garde — et une page a une adresse que le
            navigateur sait rouvrir. */}
        <Link href={`/facture?periode=${facture.periode}&etablissement=${facture.etablissementId}`}
          className="flex items-center gap-1 underline opacity-80 hover:opacity-100">
          <MdPrint /> {t("facture.mentions.print")}
        </Link>
        {facture.mentions?.adresseParDefaut && facture.mentions?.adresse && (
          <span className="opacity-50">{t("facture.mentions.addressFromProfile")}</span>
        )}
      </div>

      {ouvert && (
        <div className="mt-2 flex flex-col gap-2 text-xs">
          <label className="flex flex-col gap-1">
            {t("facture.mentions.address")}
            <textarea value={adresse} onChange={e => setAdresse(e.target.value)} rows={3} maxLength={500}
              placeholder={t("facture.mentions.addressPlaceholder")} className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1">
            {t("facture.mentions.reference")}
            <input value={reference} onChange={e => setReference(e.target.value)} maxLength={120}
              placeholder={t("facture.mentions.referencePlaceholder")} className="rounded bg-tertiary p-2" />
          </label>
          <label className="flex flex-col gap-1">
            {t("facture.mentions.note")}
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500}
              placeholder={t("facture.mentions.notePlaceholder")} className="rounded bg-tertiary p-2" />
          </label>
          <p className="opacity-60">{t("facture.mentions.noAmountChange")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={enregistrer} disabled={busy}
              className="rounded bg-[#DC6521] px-3 py-1 font-bold hover:opacity-90 disabled:opacity-50">
              {busy ? "…" : t("facture.mentions.save")}
            </button>
            {message && <span className="opacity-80">{message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
