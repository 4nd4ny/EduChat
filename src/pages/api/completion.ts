import { AnthropicChatModels } from "../../utils/Anthropic/Anthropic.constants";
import { getAnthropicCompletion, AnthropicRequest } from "../../utils/Anthropic";
import { getOpenAICompletion, OpenAIRequest } from "../../utils/OpenAI";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  if (req.method === 'POST') {
    try {
      const { model, max_completion_tokens, messages } = await req.json();

      if (!messages) {
        return new Response(JSON.stringify({ error: "Missing messages" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      let reply: string;
      let tokenUsage: number; 

      if (model in AnthropicChatModels) {
        const payload: AnthropicRequest = {
          model,
          max_tokens: max_completion_tokens,
          messages,
        };
        console.log("Sending request to Anthropic:", payload); // Pour le debug
        // Appel à la fonction qui récupère la réponse et les tokens
        ({ reply, tokenUsage } = await getAnthropicCompletion(payload));
      } else {
        const payload: OpenAIRequest = {
          model,
          max_completion_tokens,
          messages,
        };
        console.log("Sending request to OpenAI:", payload); // Pour le debug
        // Appel à la fonction qui récupère la réponse et les tokens
        ({ reply, tokenUsage } = await getOpenAICompletion(payload));  
      } 
      // Retourner la réponse structurée avec la réponse et le nombre de tokens utilisés
      const responseBody = JSON.stringify({ reply, tokenUsage });

      // Retourner la réponse structurée
      return new Response(responseBody, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });

    } catch (e: any) {
      console.error("Error in completion handler:", e); // Pour le debug
      return new Response(JSON.stringify({ 
        error: {
          message: e.message || "Error fetching response from Anthropic API"
        }
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }
  } else {
    return new Response(JSON.stringify({ 
      error: { message: "Method not allowed. Only POST requests are supported." }
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
