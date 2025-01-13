import { AnthropicChatModel } from "./Anthropic.types";

export const AnthropicChatModels: Record<string, AnthropicChatModel> = {
 
  "claude-3-5-sonnet-latest": {
    id: "claude-3-5-sonnet-latest",
    name: "claude-3-5-sonnet-latest",
    maxLimit: 8192,
    temperature: 0.7,
  },

  "claude-3-5-haiku-latest": {
    id: "claude-3-5-haiku-latest",
    name: "claude-3-5-haiku-latest",
    maxLimit: 4096,
    temperature: 0.3,
  },

};

export const defaultConfig = {
  model: "claude-3-5-sonnet-latest",
  max_completion_tokens: 8192,
  temperature: 0.7,
};

