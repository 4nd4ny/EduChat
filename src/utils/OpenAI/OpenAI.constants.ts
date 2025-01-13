import { OpenAIModel } from "./OpenAI.types";

export const OpenAIChatModels: Record<string, OpenAIModel> = {

  "o1": {
    id: "o1",
    name: "o1",
    maxLimit: 100000,
  },
};

export const defaultConfig = {
  model: "o1",
  max_completion_tokens: 100000,
};

