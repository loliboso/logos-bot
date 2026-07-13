import { describe, it, expect } from "vitest";
import { createAiProvider } from "../../src/ai/factory";
import { GeminiProvider } from "../../src/ai/gemini-provider";
import { AnthropicProvider } from "../../src/ai/anthropic-provider";
import { VertexProvider } from "../../src/ai/vertex-provider";

describe("createAiProvider", () => {
  it("returns GeminiProvider when AI_PROVIDER=gemini", () => {
    const p = createAiProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g-key" });
    expect(p).toBeInstanceOf(GeminiProvider);
  });

  it("returns AnthropicProvider when AI_PROVIDER=anthropic", () => {
    const p = createAiProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a-key" });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it("returns VertexProvider when AI_PROVIDER=vertex", () => {
    const p = createAiProvider({
      AI_PROVIDER: "vertex",
      VERTEX_PROJECT_ID: "slack-drive-integration-502007",
      GOOGLE_SERVICE_ACCOUNT_KEY: "{}",
    });
    expect(p).toBeInstanceOf(VertexProvider);
  });

  it("defaults to Gemini when GEMINI_API_KEY is set and no explicit provider", () => {
    const p = createAiProvider({ GEMINI_API_KEY: "g-key" });
    expect(p).toBeInstanceOf(GeminiProvider);
  });

  it("defaults to Anthropic when only ANTHROPIC_API_KEY is set", () => {
    const p = createAiProvider({ ANTHROPIC_API_KEY: "a-key" });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });

  it("passes GEMINI_MODEL through when provided", () => {
    const p = createAiProvider({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "g-key",
      GEMINI_MODEL: "gemini-2.5-pro",
    }) as GeminiProvider;
    expect((p as any).model).toBe("gemini-2.5-pro");
  });

  it("throws a helpful error when the selected provider's key is missing", () => {
    expect(() => createAiProvider({ AI_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    expect(() => createAiProvider({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("throws when no provider can be determined", () => {
    expect(() => createAiProvider({})).toThrow(/AI_PROVIDER|GEMINI_API_KEY|ANTHROPIC_API_KEY/);
  });
});
