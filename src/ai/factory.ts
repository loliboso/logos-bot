import { AiProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";

/**
 * Select the AI provider from the environment. Switching providers is a config
 * change, not a code change:
 *   - AI_PROVIDER=gemini    → GeminiProvider   (needs GEMINI_API_KEY)
 *   - AI_PROVIDER=anthropic → AnthropicProvider (needs ANTHROPIC_API_KEY)
 * If AI_PROVIDER is unset, we infer from whichever key is present (Gemini wins
 * if both are set, since that's the current direction).
 */
export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const explicit = env.AI_PROVIDER?.toLowerCase();
  const provider = explicit || (env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : undefined);

  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is not set.");
    return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
  }
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
    return new AnthropicProvider(env.ANTHROPIC_API_KEY);
  }

  throw new Error(
    "No AI provider configured: set AI_PROVIDER=gemini|anthropic and the matching key (GEMINI_API_KEY or ANTHROPIC_API_KEY)."
  );
}
