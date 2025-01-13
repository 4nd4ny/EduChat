import React, { useCallback } from "react";
import { useAnthropic } from "../context/AnthropicProvider";
import { MdSend } from "react-icons/md";

type Props = {};

export default function ChatInput({}: Props) {
  const { loading } = useAnthropic();
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = React.useState("");

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const { addMessage } = useAnthropic();

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    if (loading) return;
    e.preventDefault();
    
    addMessage(input, true, "user");
    setInput("");
  }, [loading, input, addMessage]);

  // Gestion de la hauteur du textarea
  React.useEffect(() => {
    const resize = () => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = "40px";
        textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight}px`;
      }
    };
    resize();
  }, [input]);

  // Gestion de la touche Entrée
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && input.trim()) {
        e.preventDefault();
        handleSubmit(e as any);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleSubmit, input]);

  return (
    <div className="fixed bottom-0 flex flex-grow h-40 w-full bg-gradient-to-t from-[rgb(var(--bg-secondary))] to-transparent md:w-[calc(100%-320px)]">
      <form
        className="mx-auto flex flex-grow h-full w-full items-end justify-center p-4 pb-10"
        onSubmit={handleSubmit}
      >
        <div className="relative flex flex-grow w-full flex-row rounded border border-stone-500/20 bg-tertiary shadow-xl">
          <textarea
            name="query"
            placeholder="Posez votre question ici..."
            ref={textAreaRef}
            className="flex flex-grow max-h-[200px] w-full resize-none border-none bg-tertiary p-4 text-primary outline-none"
            onChange={handleChange}
            value={input}
            rows={1}
          />
          <button
            type="submit"
            className="rounded p-4 text-primary hover:bg-primary/50"
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <div className="mx-auto h-5 w-5 animate-spin rounded-full border-b-2 border-white" />
            ) : (
              <MdSend />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}