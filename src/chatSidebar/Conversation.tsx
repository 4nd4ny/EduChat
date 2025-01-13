import Link from "next/link";
import React, { useEffect } from "react";
import {
  MdChatBubbleOutline,
  MdCheck,
  MdClear,
  MdDelete,
  MdDownload, 
  MdDriveFileRenameOutline,
} from "react-icons/md";
import { Conversation as ConversationI } from "../context/History";
import { useAnthropic } from "../context/AnthropicProvider";

type Props = {
  id: string;
  conversation: ConversationI;
  active: boolean;
};

// Fonction utilitaire pour extraire le contenu textuel d'un message
const getMessageContent = (content: string | { reply: string; tokenUsage: number }): string => {
  if (typeof content === 'string') {
    return content;
  }
  return content.reply;
};

export default function Conversation({ id, conversation, active }: Props) {
  const { updateConversationName, deleteConversation } = useAnthropic();
  const [editing, setEditing] = React.useState(false);

  // Fonction pour obtenir le nom initial
  const getInitialName = (): string => {
    if (conversation.name) {
      return conversation.name;
    }
    if (conversation.messages[0]?.content) {
      return getMessageContent(conversation.messages[0].content);
    }
    return "...";
  };

  const [name, setName] = React.useState<string>(getInitialName());

  // Synchroniser l'état local du nom avec les changements de la conversation
  useEffect(() => {
    setName(getInitialName());
  }, [conversation.name, conversation.messages]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleNameSubmit = () => {
    updateConversationName(id, name);
    setEditing(false);
  };

  const handleNameCancel = () => {
    setName(conversation.name);
    setEditing(false);
  };

  const handleNameEdit = () => {
    setEditing(true);
  };

  const handleDelete = () => {
    deleteConversation(id);
  };

  const handleDownload = () => {
    
    function sanitizeFilename(input: string): string {
      let sanitized = input.replace(/\s+/g, "-");
      sanitized = sanitized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      sanitized = sanitized.replace(/[^a-zA-Z0-9-_]/g, "");
      return sanitized.toLowerCase();
    };

    // Export en format texte (markdown)
    const conversationText = conversation.messages
      .map((msg: any) => `${msg.role}: ${getMessageContent(msg.content)}`)
      .join("\n\n");
    
    const textBlob = new Blob([conversationText], { type: "text/plain" });
    const textLink = document.createElement("a");
    textLink.href = URL.createObjectURL(textBlob);
    textLink.download = `${sanitizeFilename(conversation.name)}.md`;
    textLink.click();

    // Export en format JSON
    const jsonData = JSON.stringify(conversation, null, 2);
    const jsonBlob = new Blob([jsonData], { type: "application/json" });
    const jsonLink = document.createElement("a");
    jsonLink.href = URL.createObjectURL(jsonBlob);
    jsonLink.download = `${sanitizeFilename(conversation.name)}.json`;
    jsonLink.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    }
  };

  return (
    <Link
      href={`/chat/${id}`}
      className={`group relative flex flex-row items-center gap-3 rounded p-3 hover:bg-secondary ${
        active ? "bg-secondary" : ""
      }`}
    >
      <span>
        <MdChatBubbleOutline />
      </span>
      <div className="relative flex grow truncate text-clip">
        {editing ? (
          <input
            type="text"
            className="z-50 w-full rounded bg-transparent p-[1px] text-primary outline-primary"
            onChange={handleNameChange}
            value={name}
          />
        ) : (
          name
        )}
        <div
          className={`absolute bottom-0 right-0 z-10 h-full w-24 bg-gradient-to-r from-transparent ${
            active
              ? "to-[rgb(var(--bg-secondary))]"
              : "to-[rgb(var(--bg-primary))] group-hover:to-[rgb(var(--bg-secondary))]"
          }`}
        />
      </div>

      {active && !editing && (
        <div className="flex items-center gap-2">
          <button
            className="text-xl opacity-60 transition-opacity hover:opacity-100"
            onClick={handleNameEdit}
          >
            <MdDriveFileRenameOutline />
          </button>
          <button
            className="text-xl opacity-60 transition-opacity hover:opacity-100"
            onClick={handleDelete}
          >
            <MdDelete />
          </button>
          <button
            className="text-xl opacity-60 transition-opacity hover:opacity-100"
            onClick={handleDownload}
          >
            <MdDownload />
          </button>
        </div>
      )}

      {active && editing && (
        <div className="flex items-center gap-2">
          <button
            className="text-xl opacity-60 transition-opacity hover:opacity-100"
            onClick={handleNameSubmit}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            <MdCheck />
          </button>
          <button
            className="text-xl opacity-60 transition-opacity hover:opacity-100"
            onClick={handleNameCancel}
          >
            <MdClear />
          </button>
        </div>
      )}
    </Link>
  );
}
