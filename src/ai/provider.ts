/**
 * Provider-agnostic seam for structured LLM calls.
 *
 * Both natural-language features in this bot (request parsing and asset
 * metadata inference) follow the same shape: send a prompt plus a single tool
 * schema, get back a validated structured object. Abstracting that here lets us
 * swap Anthropic for Gemini (or a rule-based stub) by implementing this one
 * interface — no changes to RequestParser or AiBuilder.
 */
export interface StructuredRequest {
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: object;
  maxTokens?: number;
}

export interface AiProvider {
  /**
   * Run a structured generation. Returns the tool-call input object, or null
   * if the model produced no structured result (callers apply their own
   * fallback).
   */
  generateStructured(req: StructuredRequest): Promise<Record<string, any> | null>;
}
