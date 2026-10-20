import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatModel } from "./model.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function stubModelEnv(): void {
  vi.stubEnv("MODEL_ID", "deepseek/deepseek-v4.1-flash-1017");
  vi.stubEnv("MODEL_API_KEY", "test-key");
  vi.stubEnv("MODEL_BASE_URL", "https://openrouter.ai/api/v1");
}

describe("live model configuration", () => {
  it("uses the OpenRouter base URL and default output cap", () => {
    stubModelEnv();
    vi.stubEnv("MODEL_MAX_TOKENS", "");

    const model = createChatModel();

    expect(model.model).toBe("deepseek/deepseek-v4.1-flash-1017");
    expect(model.clientConfig.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(model.maxTokens).toBe(2_048);
  });

  it("accepts an explicit output cap", () => {
    stubModelEnv();
    vi.stubEnv("MODEL_MAX_TOKENS", "4096");

    expect(createChatModel().maxTokens).toBe(4_096);
  });

  it("rejects an invalid output cap", () => {
    stubModelEnv();
    vi.stubEnv("MODEL_MAX_TOKENS", "0");

    expect(() => createChatModel()).toThrow(/MODEL_MAX_TOKENS/);
  });

  it("requires a model ID and API key", () => {
    vi.stubEnv("MODEL_ID", "");
    vi.stubEnv("MODEL_API_KEY", "");
    expect(() => createChatModel()).toThrow(/MODEL_ID/);

    vi.stubEnv("MODEL_ID", "deepseek/deepseek-v4.1-flash-1017");
    expect(() => createChatModel()).toThrow(/MODEL_API_KEY/);
  });
});
