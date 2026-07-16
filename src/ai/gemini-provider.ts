import { AiProvider, StructuredRequest } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(
    private apiKey: string,
    private model: string = DEFAULT_MODEL,
    opts: { timeoutMs?: number; maxAttempts?: number } = {}
  ) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

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

    // Retry with backoff so a single stalled/rate-limited/5xx request can't
    // freeze a whole scan. Each attempt has a hard timeout via AbortController —
    // without it a hung connection would wait forever (this happened in prod).
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          // 429 / 5xx are transient → retry; 4xx are our fault → fail fast.
          if ((res.status === 429 || res.status >= 500) && attempt < this.maxAttempts) {
            lastError = new Error(`Gemini API error ${res.status}: ${text}`);
            await sleep(attempt * 500);
            continue;
          }
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
      } catch (err) {
        // AbortError = our timeout fired; TypeError = fetch network failure.
        // Both are transient — retry while attempts remain.
        const isTimeout = err instanceof Error && err.name === "AbortError";
        const isNetwork = err instanceof TypeError;
        if ((isTimeout || isNetwork) && attempt < this.maxAttempts) {
          lastError = isTimeout
            ? new Error(`Gemini request timed out after ${this.timeoutMs}ms`)
            : err;
          await sleep(attempt * 500);
          continue;
        }
        throw isTimeout
          ? new Error(`Gemini request timed out after ${this.timeoutMs}ms`)
          : err;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new Error("Gemini request failed after retries");
  }
}
