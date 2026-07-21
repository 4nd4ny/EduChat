import ChatMessages from "../../chat/ChatMessages";
import { useRouter } from "next/router";
import React from "react";
import { getConversation } from "../../context/History";
import { useAnthropic } from "../../context/AnthropicProvider";

export default function Chat() {
  const { loadConversation, conversationId } = useAnthropic();
  const { id } = useRouter().query;

  React.useEffect(() => {
    if (!id) return;
    if (typeof window !== "undefined") {
      // Get the conversation from local storage
      const conversation = getConversation(id as string);

      // If there is no conversation, redirect to the home page
      if (!conversation) {
        window.location.href = "/";
      } else if (conversationId !== id) {
        // If the conversation is not loaded, load it
        loadConversation(id as string, conversation);
      }
    }
  }, [id]);

  return (
    <React.Fragment>
      <div className="max-w-screen relative h-screen max-h-screen w-screen overflow-hidden">
        {/* La sidebar est montée globalement par src/context/Layout.tsx */}
        <ChatMessages />
      </div>
    </React.Fragment>
  );
}
