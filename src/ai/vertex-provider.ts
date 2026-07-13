import { google } from "googleapis";
import { AiProvider, StructuredRequest } from "./provider";

const DEFAULT_MODEL = "gemini-2.5-flash";
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

export interface AccessTokenProvider {
  getAccessToken(): Promise<string | null>;
}

export interface VertexProviderOptions {
  projectId: string;
  serviceAccountKey: string;
  location?: string;
  model?: string;
  tokenProvider?: AccessTokenProvider;
}

/**
 * Vertex AI implementation of AiProvider.
 *
 * Authenticates with the supplied Google service account and calls Vertex's
 * generateContent endpoint using a short-lived OAuth access token. This keeps
 * company credentials in GCP instead of requiring a Google AI Studio API key.
 */
export class VertexProvider implements AiProvider {
  private readonly projectId: string;
  private readonly location: string;
  private readonly model: string;
  private readonly tokenProvider: AccessTokenProvider;

  constructor(options: VertexProviderOptions) {
    this.projectId = options.projectId;
    this.location = options.location || "global";
    this.model = options.model || DEFAULT_MODEL;
    this.tokenProvider = options.tokenProvider || createServiceAccountTokenProvider(options.serviceAccountKey);
  }

  async generateStructured(req: StructuredRequest): Promise<Record<string, any> | null> {
    const accessToken = await this.tokenProvider.getAccessToken();
    if (!accessToken) throw new Error("Vertex AI authentication failed: no access token was returned.");

    const body = {
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: req.toolName,
              description: req.toolDescription,
              parameters: req.schema,
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

    const res = await fetch(this.endpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Vertex AI error ${res.status}: ${text}`);
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

  private endpoint(): string {
    const host = this.location === "global"
      ? "https://aiplatform.googleapis.com"
      : `https://${this.location}-aiplatform.googleapis.com`;
    return `${host}/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;
  }
}

function createServiceAccountTokenProvider(serviceAccountKey: string): AccessTokenProvider {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(serviceAccountKey),
    scopes: [CLOUD_PLATFORM_SCOPE],
  });
  return {
    getAccessToken: async () => (await auth.getAccessToken()) ?? null,
  };
}
