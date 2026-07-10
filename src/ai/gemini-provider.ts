import { AiProvider, StructuredRequest } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Gemini implementation of AiProvider using the generateContent REST API.
 *
 * Uses Node's built-in fetch (Node 18+) so it needs no extra dependency —
 * handy while the project's npm tree can't resolve new installs. We force a
 * single function call (function_calling_config mode ANY) so the model must
 * return structured args matching our schema, mirroring how AnthropicProvider
 * forces a tool_use.
 */
export class GeminiProvider implements AiProvider {
  constructor(
    private apiKey: string,
    private model: string = DEFAULT_MODEL
  ) {}

  async generateStructured(req: StructuredRequest): Promise<Record<string, any> | null> {
    const url = `${API_BASE}/${this.model}:generateContent`;

    const body = {
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: req.toolName,
              description: req.toolDescription,
              parametersJsonSchema: req.schema,
            },
          ],
        },
      ],
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: [req.toolName],
        },
      },
      generationConfig: {
        maxOutputTokens: req.maxTokens ?? 1024,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as any;
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.functionCall?.name === req.toolName) {
        return (part.functionCall.args ?? {}) as Record<string, any>;
      }
    }
    return null;
  }
}
