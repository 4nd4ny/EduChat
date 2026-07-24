import React, { useEffect, useState } from "react";
import { MdPerson, MdSmartToy, MdContentCopy, MdDeleteSweep } from "react-icons/md";
import AssistantMessageContent from "./AssistantMessageContent";
import UserMessageContent from "./UserMessageContent";
import { useAnthropic } from "../context/AnthropicProvider";

type Props = {
  message: any; // On utilise any car le message peut venir des deux providers
  isInitialUserMessage: boolean;
  isLastAssistantMessage: boolean;
  messageIndex: number; 
};

export default function ChatMessage({
  message: { role, content, model, attachments },
  isInitialUserMessage,
  isLastAssistantMessage,
  messageIndex
}: Props) {
  const [hover, setHover] = React.useState(false);
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [showDeleteMessage, setShowDeleteMessage] = useState(false);
  const anthropic = useAnthropic();
  const { deleteMessagesFromIndex } = useAnthropic();

  useEffect(() => {
    if (isInitialUserMessage && role === 'user') {
      anthropic.generateTitle();
    }
  }, [isInitialUserMessage, role]);

  const handleCopy = () => {
    const textContent = typeof content === 'string' ? content : content.reply;
    navigator.clipboard.writeText(textContent);
    setShowCopiedMessage(true);
    setTimeout(() => setShowCopiedMessage(false), 2000);
  };
  
  const handleDeleteFromHere = () => {
    setShowDeleteMessage(true);
    setTimeout(() => {
      setShowDeleteMessage(false);
      deleteMessagesFromIndex(messageIndex); // Utilise la fonction deleteMessagesFromIndex du provider
    }, 1000);
  };

  const formatModelName = (model: string): string => {
    // Cas spéciaux
    if (model === 'o1') return 'O1';
    
    // Split sur le tiret et retourne le premier élément
    const [firstPart] = model.split('-');
    
    // Première lettre en majuscule
    return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
  };

  return (
    <div
      className={`flex cursor-pointer flex-row items-center p-4 transition-all ${
        role === "user" ? "bg-tertiary hover:bg-secondary/50" : "bg-secondary"
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="relative max-w-screen mx-auto flex w-full max-w-6xl flex-row items-center">
        <div
          className={`flex sticky top-0 my-4 h-10 w-10 items-center justify-center text-4xl mr-2 self-start transition-colors ${
            hover ? "text-stone-300" : "text-primary/20"
          }`}
        >
          {role === "user" ? <MdPerson /> : <MdSmartToy />}
        </div>
        <div className="overflow-x-auto">
          {role === 'assistant' && model && (
            <div className="text-sm font-bold text-gray-500">
              {formatModelName(model)}
            </div>
          )}
          {role === "user" && Array.isArray(attachments) && attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-2 text-xs opacity-70">
              {attachments.map((a: any, i: number) => (
                <span key={i} className="rounded bg-primary/10 px-2 py-0.5">
                  📎 {a.name || (a.kind === "pdf" ? "document.pdf" : "image")}
                </span>
              ))}
            </div>
          )}
          <div className="text-md prose w-full max-w-6xl rounded p-4 text-primary dark:prose-invert prose-code:text-primary prose-pre:bg-transparent prose-pre:p-0">
            {role === "user" ? (
              <UserMessageContent content={typeof content === 'string' ? content : content.reply} />
            ) : (
              <AssistantMessageContent content={typeof content === 'string' ? content : content.reply} />
            )}
          </div>
          {/* Afficher les boutons de contrôle en fonction du rôle */}
          {role === "user" ? (
            // Interface pour les messages utilisateur
            <div className="ml-1 mr-3">
              <div className="relative mx-auto flex flex-row items-center mt-5 space-x-12">
                {showDeleteMessage && (
                  <div className="absolute bottom-full mb-2 text-xs text-white">
                    Suppression des messages...
                  </div>
                )}
              </div>
              <div className="relative mx-auto flex flex-row items-center mb-2 space-x-12">
                <div
                  className={`cursor-pointer text-gray-500 transition-colors transition-transform transform hover:scale-110 hover:bg-red-600 hover:text-white rounded-full flex items-center justify-center w-12 h-12`}
                  onClick={handleDeleteFromHere}
                  title="Supprimer à partir d'ici"
                >
                  <MdDeleteSweep className="text-2xl" />
                </div>
              </div>
            </div>
          ) : (
            // Interface pour les messages assistant
            <div className="ml-1 mr-3">
              <div className="relative mx-auto flex flex-row items-center mt-5 space-x-12">
                {(showCopiedMessage && (
                  <div className="absolute bottom-full mb-2 text-xs text-white">
                    Réponse copiée !
                  </div>
                ))}
              </div>
              <div className="relative mx-auto flex flex-row items-center mb-2 space-x-12">
                <div
                  className={`cursor-pointer text-gray-500 transition-colors transition-transform transform hover:scale-110 hover:bg-blue-600 hover:text-white rounded-full flex items-center justify-center w-12 h-12`}
                  onClick={handleCopy}
                  title="Copier"
                >
                  <MdContentCopy className="text-2xl" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
