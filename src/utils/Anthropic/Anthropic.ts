import { AnthropicApiKey } from "../env";
import { AnthropicChatMessage, AnthropicConfig } from "./Anthropic.types";

export type AnthropicRequest = {
  messages: AnthropicChatMessage[];
} & AnthropicConfig;

export const getAnthropicCompletion = async (
  payload: AnthropicRequest
): Promise<{ reply: string; tokenUsage: number }> => { 
  let reply = "Something went wrong."; // Valeur par défaut en cas d'erreur
  let currentTokenUsage = 0;  // Variable pour les tokens utilisés dans l'appel actuel

  try {

    // Vérifier si messages est un tableau
    if (!Array.isArray(payload.messages)) {
      throw new Error("Messages must be an array");
    }

    const formattedMessages = payload.messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content.reply
    }));

    const requestBody = {
      model: payload.model,
      messages: formattedMessages,
      max_tokens: payload.max_tokens || 1024, // Valeur par défaut si non fournie
      system: "You are Claude, a helpful AI assistant created by Anthropic."
    };

    // console.log("Sending request to Anthropic:", requestBody);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      headers: {
        "x-api-key": AnthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    
    // Vérifier si la réponse est correcte
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // console.log("API Response:", data); // Pour le debug

    // Vérifier la structure de la réponse
    if (data && data.content && data.content.length > 0) {
      // Extraire le texte du premier bloc de contenu
      reply = data.content[0].text || "No content in response.";
      
      // Extraire l'utilisation des tokens si disponible
      if (data.usage) {
        currentTokenUsage = data.usage.input_tokens + data.usage.output_tokens;
      }
    } else {
      throw new Error("Unexpected response structure from Anthropic API");
    }

  } catch (error: any) {
    console.error("Error in getAnthropicCompletion:", error);
    reply = error.message || "An unexpected error occurred.";
    }
  // Retourner la réponse et le nombre de tokens utilisés
  return { reply, tokenUsage: currentTokenUsage };
};
