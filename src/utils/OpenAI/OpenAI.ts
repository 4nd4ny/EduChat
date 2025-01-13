import { OpenAIApiKey } from "../env";
import { OpenAIChatMessage, OpenAIConfig } from "./OpenAI.types";

export type OpenAIRequest = {
  messages: OpenAIChatMessage[];
} & OpenAIConfig;

export const getOpenAICompletion = async (
  payload: OpenAIRequest
): Promise<{ reply: string; tokenUsage: number }> => { 
  let reply = "Something went wrong."; // Valeur par défaut en cas d'erreur
  let currentTokenUsage = 0;  // Variable pour les tokens utilisés dans l'appel actuel

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      headers: {
        Authorization: `Bearer ${OpenAIApiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Vérifier si la réponse est correcte
    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          // Tenter de parser la réponse en JSON
          const errorData = await response.json();
          reply = errorData.error?.message || "An error occurred.";
        } catch (jsonParseError) {
          // Si une erreur survient lors du parsing JSON
          reply = `Failed to parse JSON response. Status: ${response.status}`;
          console.error("Error parsing JSON response:", jsonParseError);
        }
      } else {
        // La réponse n'est pas du JSON, récupérer le texte brut
        const errorText = await response.text();
        reply = `Unexpected response format from server. Status: ${response.status}. Response: ${errorText}`;
      }
    } else {
      // Extraire la réponse au format JSON
      const data = await response.json();
      if (data && data.choices && data.choices.length > 0) {
        //reply = data.choices[0].message.content.trim();
        reply = data.choices?.[0]?.message?.content || "No content in response.";
        if (data.usage) {
          const { total_tokens } = data.usage;
          currentTokenUsage = total_tokens;  // Nombre total de tokens utilisés pour cette requête
        }
      } else {
        reply = "Invalid response structure from OpenAI API.";
      }
    }

  } catch (error: any) {
    console.error("Error fetching response:", error);
    reply = error.message || "An unexpected error occurred.";
    }
  // Retourner la réponse et le nombre de tokens utilisés
  return { reply, tokenUsage: currentTokenUsage };
};
