// context/AIProviderManager.tsx
import React, { createContext, useContext, useState, useCallback } from 'react';
import { OpenAIChatModels } from '../utils/OpenAI/OpenAI.constants';
import { AnthropicChatModels } from '../utils/Anthropic/Anthropic.constants';
import OpenAIProvider from './OpenAIProvider';
import AnthropicProvider from './AnthropicProvider';

interface AIProviderContextType {
  useOpenAIForNext: boolean;
  setUseOpenAIForNext: (value: boolean) => void;
  isAnthropicModel: (model: string) => boolean;
  isOpenAIModel: (model: string) => boolean;
}

const AIProviderContext = createContext<AIProviderContextType>({
  useOpenAIForNext: false,
  setUseOpenAIForNext: () => {},
  isAnthropicModel: () => false,
  isOpenAIModel: () => false,
});

export const useAIProvider = () => useContext(AIProviderContext);

interface ProviderManagerProps {
  children: React.ReactNode;
}

export function AIProviderManager({ children }: ProviderManagerProps) {
  // Flag pour indiquer si la prochaine réponse doit utiliser OpenAI
  const [useOpenAIForNext, setUseOpenAIForNext] = useState(false);

  const isAnthropicModel = useCallback((model: string) => {
    return Object.keys(AnthropicChatModels).includes(model);
  }, []);

  const isOpenAIModel = useCallback((model: string) => {
    return Object.keys(OpenAIChatModels).includes(model);
  }, []);

  const value = {
    useOpenAIForNext,
    setUseOpenAIForNext,
    isAnthropicModel,
    isOpenAIModel,
  };

  return (
    <AIProviderContext.Provider value={value}>
      <AnthropicProvider>
        <OpenAIProvider>
          {children}
        </OpenAIProvider>
      </AnthropicProvider>
    </AIProviderContext.Provider>
  );
}