import { AnthropicChatModels } from "./Anthropic.constants";

export interface AnthropicChatMessage {
  id?: number;
  role: "assistant" | "user";
  content: string | { reply: string; tokenUsage: number };
  model?: keyof typeof AnthropicChatModels;
}

export interface AnthropicConfig {
  model: keyof typeof AnthropicChatModels;
  max_tokens?: number;
  // temperature?: number;
  // system?: string;
}

export interface AnthropicChatModel {
  id: string;
  name: string;
  maxLimit: number;
  temperature?: number;
  // system?: string;
}

export interface AnthropicContentBlock {
  type: "text";
  text: string;
}

export interface AnthropicResponse {
  id: string;
  content: AnthropicContentBlock[];
  model: string;
  role: "assistant";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ProviderSubmitFunction {
  (messages?: AnthropicChatMessage[], modelIndex?: number): Promise<void>;
}

export interface ProviderContext {
  loading: boolean;
  messages: AnthropicChatMessage[];
  submit: ProviderSubmitFunction;
  addMessage: (content?: string, submit?: boolean, role?: "user" | "assistant") => void;
  updateMessageContent: (id: number, content: string) => void;
  removeMessage: (id: number) => void;
  toggleMessageRole: (id: number) => void;
  deleteMessagesFromIndex: (index: number) => void;
}