import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_TOKEN_CAP = 2_048;
const MIN_TOKEN_CAP = 256;
const MAX_TOKEN_CAP = 32_000;

function readTokenCap(): number {
  const raw = process.env.MODEL_MAX_TOKENS?.trim();
  if (!raw) {
    return DEFAULT_TOKEN_CAP;
  }
  const parsed = Number.parseInt(raw, 10);
  if (
    !Number.isInteger(parsed) ||
    String(parsed) !== raw ||
    parsed < MIN_TOKEN_CAP ||
    parsed > MAX_TOKEN_CAP
  ) {
    throw new Error(
      `MODEL_MAX_TOKENS must be an integer between ${String(MIN_TOKEN_CAP)} and ${String(MAX_TOKEN_CAP)}.`,
    );
  }
  return parsed;
}

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
    maxTokens: readTokenCap(),
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}
