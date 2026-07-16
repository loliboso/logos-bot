import { describe, it, expect, vi, afterEach } from "vitest";
import { GeminiProvider } from "../../src/ai/gemini-provider";

const SCHEMA = { type: "object", properties: { x: { type: "string" } }, required: ["x"] };

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

describe("GeminiProvider", () => {
  it("returns the functionCall args object", async () => {
    mockFetch({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "do_thing", args: { x: "hello" } } }],
          },
        },
      ],
    });

    const provider = new GeminiProvider("fake-key");
    const result = await provider.generateStructured({
      prompt: "p",
      toolName: "do_thing",
      toolDescription: "d",
      schema: SCHEMA,
    });
    expect(result).toEqual({ x: "hello" });
  });

  it("returns null when the model produces no functionCall", async () => {
    mockFetch({
      candidates: [{ content: { parts: [{ text: "no function call" }] } }],
    });

    const provider = new GeminiProvider("fake-key");
    const result = await provider.generateStructured({
      prompt: "p",
      toolName: "do_thing",
      toolDescription: "d",
      schema: SCHEMA,
    });
    expect(result).toBeNull();
  });

  it("sends the schema, forced tool mode, and api key", async () => {
    const fn = mockFetch({
      candidates: [{ content: { parts: [{ functionCall: { name: "do_thing", args: {} } }] } }],
    });

    const provider = new GeminiProvider("secret-key", "gemini-2.5-flash");
    await provider.generateStructured({
      prompt: "my-prompt",
      toolName: "do_thing",
      toolDescription: "desc",
      schema: SCHEMA,
      maxTokens: 256,
    });

    const [url, init] = fn.mock.calls[0];
    // URL targets the configured model's generateContent endpoint.
    expect(url).toContain("gemini-2.5-flash:generateContent");
    // API key travels in the header, not the URL.
    expect((init as any).headers["x-goog-api-key"]).toBe("secret-key");
    expect(url).not.toContain("secret-key");

    const body = JSON.parse((init as any).body);
    expect(body.contents[0].parts[0].text).toBe("my-prompt");
    const fnDecl = body.tools[0].functionDeclarations[0];
    expect(fnDecl.name).toBe("do_thing");
    expect(fnDecl.description).toBe("desc");
    expect(fnDecl.parametersJsonSchema).toEqual(SCHEMA);
    // Forced to call exactly our tool.
    expect(body.toolConfig.functionCallingConfig.mode).toBe("ANY");
    expect(body.toolConfig.functionCallingConfig.allowedFunctionNames).toEqual(["do_thing"]);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
  });

  it("throws with status and body on a non-ok response", async () => {
    mockFetch({ error: { message: "bad request" } }, false, 400);

    const provider = new GeminiProvider("fake-key");
    await expect(
      provider.generateStructured({
        prompt: "p",
        toolName: "do_thing",
        toolDescription: "d",
        schema: SCHEMA,
      })
    ).rejects.toThrow(/400/);
  });

  it("does NOT retry a 4xx (fails fast)", async () => {
    const fn = mockFetch({ error: "bad" }, false, 400);
    const provider = new GeminiProvider("k", "gemini-2.5-flash", { maxAttempts: 3 });
    await expect(
      provider.generateStructured({ prompt: "p", toolName: "t", toolDescription: "d", schema: SCHEMA })
    ).rejects.toThrow(/400/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 then succeeds", async () => {
    const ok = {
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: "t", args: { x: "ok" } } }] } }] }),
      text: async () => "",
    };
    const bad = { ok: false, status: 503, json: async () => ({}), text: async () => "overloaded" };
    const fn = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", fn);

    const provider = new GeminiProvider("k", "gemini-2.5-flash", { maxAttempts: 3 });
    const result = await provider.generateStructured({ prompt: "p", toolName: "t", toolDescription: "d", schema: SCHEMA });
    expect(result).toEqual({ x: "ok" });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("times out a hung request and rejects", async () => {
    // fetch never resolves on its own; it only rejects when the abort fires.
    vi.stubGlobal("fetch", (_url: string, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const e = new Error("aborted"); e.name = "AbortError"; reject(e);
        });
      })
    );
    const provider = new GeminiProvider("k", "gemini-2.5-flash", { timeoutMs: 20, maxAttempts: 1 });
    await expect(
      provider.generateStructured({ prompt: "p", toolName: "t", toolDescription: "d", schema: SCHEMA })
    ).rejects.toThrow(/timed out/);
  });
});
