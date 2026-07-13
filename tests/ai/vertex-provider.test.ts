import { afterEach, describe, expect, it, vi } from "vitest";
import { VertexProvider } from "../../src/ai/vertex-provider";

const SCHEMA = { type: "object", properties: { brand: { type: "string" } }, required: ["brand"] };

function mockFetch(response: any, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VertexProvider", () => {
  it("uses the Vertex global endpoint with a service-account access token", async () => {
    const fetchMock = mockFetch({
      candidates: [{ content: { parts: [{ functionCall: { name: "parse_logo", args: { brand: "TNL" } } }] } }],
    });
    const tokenProvider = { getAccessToken: vi.fn(async () => "vertex-access-token") };
    const provider = new VertexProvider({
      projectId: "slack-drive-integration-502007",
      location: "global",
      serviceAccountKey: "{}",
      tokenProvider,
    });

    const result = await provider.generateStructured({
      prompt: "我要 TNL logo",
      toolName: "parse_logo",
      toolDescription: "Parse a logo request",
      schema: SCHEMA,
      maxTokens: 256,
    });

    expect(result).toEqual({ brand: "TNL" });
    expect(tokenProvider.getAccessToken).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://aiplatform.googleapis.com/v1/projects/slack-drive-integration-502007/locations/global/publishers/google/models/gemini-2.5-flash:generateContent"
    );
    expect((init as any).headers.authorization).toBe("Bearer vertex-access-token");
    expect((init as any).headers["x-goog-api-key"]).toBeUndefined();

    const body = JSON.parse((init as any).body);
    expect(body.tools[0].functionDeclarations[0].parameters).toEqual(SCHEMA);
    expect(body.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["parse_logo"]);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it("fails clearly when service-account authentication returns no access token", async () => {
    const provider = new VertexProvider({
      projectId: "project",
      serviceAccountKey: "{}",
      tokenProvider: { getAccessToken: async () => null },
    });

    await expect(
      provider.generateStructured({ prompt: "p", toolName: "tool", toolDescription: "d", schema: SCHEMA })
    ).rejects.toThrow(/access token/i);
  });
});
