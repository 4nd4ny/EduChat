import Link from "next/link";
import React, { useCallback }  from "react";
import { MdAdd, MdDeleteOutline, MdUploadFile } from "react-icons/md";
import { MAX_IMPORT_BYTES, useAnthropic } from "../context/AnthropicProvider";
import Conversations from "./Conversations";
import ButtonContainer from "./ButtonContainer";
import { useDropzone } from 'react-dropzone';
type Props = {};

export default function ChatSidebar({}: Props) {
  const { resetConversation, clearConversations, importConversation } = useAnthropic();

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
          importConversation(JSON.parse(fileContent));
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
    <div className="flex flex-col bg-gray-900 left-0 top-0 h-full max-h-screen text-primary md:fixed md:w-[320px]">
      <div className="flex h-full flex-col items-stretch p-2">

        <div className="flex flex-col gap-y-2 border-y border-white/10 py-2">  
          <Link
            href="#"
            onClick={handleNewChat}
            className="flex items-center gap-3 rounded p-3 transition-colors hover:bg-gray-100/10"
          >
            <MdAdd />
            Nouvelle discussion
          </Link>
          <div {...getRootProps()} className={`flex items-center gap-3 rounded p-3 transition-colors hover:bg-gray-100/10 cursor-pointer ${isDragActive ? 'bg-gray-100/20' : ''}`}>
            <input {...getInputProps()} />
            <MdUploadFile />
            {isDragActive ? "Déposez le fichier" : "Importer une discussion"}
          </div>
          {importError && (
            <p role="alert" className="px-3 text-xs text-red-400">{importError}</p>
          )}
        </div>

        <Conversations />

        <div className="flex flex-col gap-y-2 border-y border-white/10 py-2">
          <ButtonContainer onClick={clearConversations}>
            <MdDeleteOutline />
            Tout effacer
          </ButtonContainer>
        </div>
      </div>
    </div>
  );
}
