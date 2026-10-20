import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_TOKEN_CAP = 1024;

export function createChatModel(): ChatOpenAI {
  const modelId = process.env.MODEL_ID?.trim();
  if (!modelId) {
    throw new Error(
      "MODEL_ID is required when AGENT_MODE=live. Copy apps/agent/.env.example to apps/agent/.env and configure the model.",
    );
  }

  const apiKey = process.env.MODEL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is required when AGENT_MODE=live. Fixture mode must be selected explicitly and is visibly labeled.",
    );
  }

  const baseURL = process.env.MODEL_BASE_URL?.trim();

  return new ChatOpenAI({
    apiKey,
    model: modelId,
    temperature: 0,
    maxTokens: DEFAULT_TOKEN_CAP,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}
