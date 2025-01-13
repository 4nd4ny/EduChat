import React, { PropsWithChildren, useCallback } from "react";
import { OpenAIChatMessage, OpenAIChatModels } from "../utils/OpenAI";
import { OpenAIApiKey } from "../utils/env";

// Simplified context with only what we need
const defaultContext = {
  loading: false,
  regenerateMessage: (messages?: OpenAIChatMessage[], onSuccess?: (reply: string) => void) => {},
};

const OpenAIContext = React.createContext(defaultContext);

export default function OpenAIProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = React.useState(false);
  const modelList = Object.keys(OpenAIChatModels);

  const regenerateMessage = useCallback(async (
    messages: OpenAIChatMessage[] = [], 
    onSuccess?: (reply: string) => void
  ) => {
    if (loading || messages.length === 0) return;
    setLoading(true);

    try {
      const currentModel = modelList[0];
      const maximum = OpenAIChatModels[currentModel].maxLimit;
      
      const requestBody = {
        max_completion_tokens: maximum,
        model: currentModel,
        messages: messages.map(({ role, content }) => ({ 
          role, 
          content: typeof content === 'string' ? content : content.reply 
        })),
      };

      const response = await fetch("/api/completion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OpenAIApiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch response");
      }

      const { reply } = await response.json();
      if (onSuccess) {
        onSuccess(reply);
      }
    } catch (error) {
      console.error("Error in regenerateMessage:", error);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <OpenAIContext.Provider value={{ loading, regenerateMessage }}>
      {children}
    </OpenAIContext.Provider>
  );
}

export const useOpenAI = () => React.useContext(OpenAIContext);