import { AiProvider } from "./provider";
import { AnthropicProvider } from "./anthropic-provider";
import { GeminiProvider } from "./gemini-provider";
import { VertexProvider } from "./vertex-provider";
import { resolveServiceAccountKey } from "../config";

/**
 * Select the AI provider from the environment. Switching providers is a config
 * change, not a code change:
 *   - AI_PROVIDER=vertex    → VertexProvider   (needs Google service-account credentials)
 *   - AI_PROVIDER=gemini    → GeminiProvider   (needs GEMINI_API_KEY)
 *   - AI_PROVIDER=anthropic → AnthropicProvider (needs ANTHROPIC_API_KEY)
 * If AI_PROVIDER is unset, we infer from whichever key is present (Gemini wins
 * if both are set, since that's the current direction).
 */
export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const explicit = env.AI_PROVIDER?.toLowerCase();
  const provider = explicit || (env.VERTEX_PROJECT_ID ? "vertex" : env.GEMINI_API_KEY ? "gemini" : env.ANTHROPIC_API_KEY ? "anthropic" : undefined);

  if (provider === "vertex") {
    if (!env.VERTEX_PROJECT_ID) throw new Error("AI_PROVIDER=vertex but VERTEX_PROJECT_ID is not set.");
    return new VertexProvider({
      projectId: env.VERTEX_PROJECT_ID,
      location: env.VERTEX_LOCATION || undefined,
      model: env.GEMINI_MODEL || undefined,
      serviceAccountKey: resolveServiceAccountKey(env),
    });
  }

  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("AI_PROVIDER=gemini but GEMINI_API_KEY is not set.");
    return new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL || undefined);
  }
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) throw new Error("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set.");
    return new AnthropicProvider(env.ANTHROPIC_API_KEY);
  }

  throw new Error(
    "No AI provider configured: set AI_PROVIDER=vertex|gemini|anthropic and the matching credentials."
  );
}
