import Link from "next/link";
import React, { useCallback }  from "react";
import { MdAdd, MdDeleteOutline, MdDownload, MdSync, MdUploadFile } from "react-icons/md";
import { MAX_IMPORT_BYTES, useAnthropic } from "../context/AnthropicProvider";
import { isProfile, applyProfile, downloadProfile } from "../utils/profile";
import { syncProfile } from "../utils/profileSync";
import { getAccount } from "../utils/account";
import Conversations from "./Conversations";
import ButtonContainer from "./ButtonContainer";
import { useDropzone } from 'react-dropzone';
import { useT } from "../i18n/useT";
type Props = {};

export default function ChatSidebar({}: Props) {
  const { resetConversation, clearConversations, importConversation } = useAnthropic();
  const t = useT();
  const [syncMessage, setSyncMessage] = React.useState("");
  const hasAccount = typeof window !== "undefined" && !!getAccount();

  const handleSync = async () => {
    setSyncMessage("…");
    const result = await syncProfile();
    if (result.ok) {
      setSyncMessage(result.mergedConversations > 0
        ? `Synchronisé (+${result.mergedConversations} conversation(s))` : "Synchronisé ✓");
      if (result.mergedConversations > 0) setTimeout(() => window.location.reload(), 800);
    } else {
      setSyncMessage(result.reason === "optout"
        ? "Option de synchronisation non activée (re-vérifiez votre email en la cochant)."
        : result.reason === "auth" ? "Identifiez-vous d'abord sur /verifier." : "Échec de synchronisation.");
    }
  };

  const handleNewChat = (e: React.MouseEvent) => {
    e.preventDefault();
    resetConversation();
  }; 

  const [importError, setImportError] = React.useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setImportError("");
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onabort = () => setImportError("Lecture du fichier interrompue.");
      reader.onerror = () => setImportError("Impossible de lire le fichier.");
      reader.onload = () => {
        const fileContent = reader.result as string;
        try {
          const jsonData = JSON.parse(fileContent);
          if (isProfile(jsonData)) {
            // Profil complet (conversations + favoris + notes) : fusion puis
            // rechargement pour que toute l'UI reflète l'état importé.
            const { conversations } = applyProfile(jsonData);
            setImportError("");
            alert(`Profil importé : ${conversations} conversation(s) ajoutée(s).`);
            window.location.reload();
            return;
          }
          importConversation(jsonData);
        } catch (error) {
          setImportError("Fichier illisible : ce n'est pas du JSON valide.");
        }
      };
      reader.readAsText(file);
    });
  }, [importConversation]);

  // Les fichiers écartés par react-dropzone (trop volumineux, mauvais type)
  // doivent le dire à l'utilisateur, et non disparaître en silence.
  const onDropRejected = useCallback((rejections: any[]) => {
    const tooLarge = rejections.some(r => r.errors?.some((e: any) => e.code === "file-too-large"));
    setImportError(tooLarge
      ? `Fichier trop volumineux (maximum ${MAX_IMPORT_BYTES / (1024 * 1024)} Mo).`
      : "Fichier refusé : un fichier .json est attendu.");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    maxSize: MAX_IMPORT_BYTES,
    accept: {
      'application/json': ['.json']
    }
  });

  return (
    <div data-tour="history" className="flex h-full max-h-full flex-col bg-gray-900 text-primary lg:fixed lg:left-0 lg:top-[60px] lg:h-[calc(100vh-60px)] lg:w-[320px]">
      <div className="flex h-full min-h-0 flex-col items-stretch p-2">

        <div className="flex shrink-0 flex-col gap-y-2 border-y border-white/10 py-2">  
          <Link
            href="#"
            onClick={handleNewChat}
            className="flex items-center gap-3 rounded p-3 transition-colors hover:bg-gray-100/10"
          >
            <MdAdd />
            {t("sidebar.new")}
          </Link>
          <div {...getRootProps()} className={`flex items-center gap-3 rounded p-3 transition-colors hover:bg-gray-100/10 cursor-pointer ${isDragActive ? 'bg-gray-100/20' : ''}`}>
            <input {...getInputProps()} />
            <MdUploadFile />
            {isDragActive ? t("sidebar.drop") : t("sidebar.import")}
          </div>
          {importError && (
            <p role="alert" className="px-3 text-xs text-red-400">{importError}</p>
          )}
        </div>

        <Conversations />

        <div className="flex shrink-0 flex-col gap-y-2 border-y border-white/10 py-2">
          <ButtonContainer onClick={() => downloadProfile()}>
            <MdDownload />
            {t("sidebar.exportAll")}
          </ButtonContainer>
          {hasAccount && (
            <ButtonContainer onClick={handleSync}>
              <MdSync />
              Synchroniser (serveur)
            </ButtonContainer>
          )}
          {syncMessage && <p className="px-3 text-xs opacity-70">{syncMessage}</p>}
          <ButtonContainer onClick={clearConversations}>
            <MdDeleteOutline />
            {t("sidebar.clear")}
          </ButtonContainer>
        </div>
      </div>
    </div>
  );
}
