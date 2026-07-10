import { describe, it, expect, vi } from "vitest";
import { AnthropicProvider } from "../../src/ai/anthropic-provider";

const SCHEMA = { type: "object", properties: { x: { type: "string" } } };

describe("AnthropicProvider", () => {
  it("returns the tool_use input object", async () => {
    const provider = new AnthropicProvider("fake-key");
    vi.spyOn((provider as any).client.messages, "create").mockResolvedValue({
      content: [{ type: "tool_use", id: "c1", name: "do_thing", input: { x: "hello" } }],
    });

    const result = await provider.generateStructured({
      prompt: "p",
      toolName: "do_thing",
      toolDescription: "d",
      schema: SCHEMA,
    });
    expect(result).toEqual({ x: "hello" });
  });

  it("returns null when the model produces no tool_use block", async () => {
    const provider = new AnthropicProvider("fake-key");
    vi.spyOn((provider as any).client.messages, "create").mockResolvedValue({
      content: [{ type: "text", text: "no tool call" }],
    });

    const result = await provider.generateStructured({
      prompt: "p",
      toolName: "do_thing",
      toolDescription: "d",
      schema: SCHEMA,
    });
    expect(result).toBeNull();
  });

  it("passes the schema and tool name through to the API", async () => {
    const provider = new AnthropicProvider("fake-key");
    const spy = vi
      .spyOn((provider as any).client.messages, "create")
      .mockResolvedValue({ content: [{ type: "tool_use", id: "c1", name: "do_thing", input: {} }] });

    await provider.generateStructured({
      prompt: "my-prompt",
      toolName: "do_thing",
      toolDescription: "desc",
      schema: SCHEMA,
      maxTokens: 256,
    });

    const arg = spy.mock.calls[0][0] as any;
    expect(arg.max_tokens).toBe(256);
    expect(arg.tools[0].name).toBe("do_thing");
    expect(arg.tools[0].input_schema).toBe(SCHEMA);
    expect(arg.tool_choice).toEqual({ type: "tool", name: "do_thing" });
    expect(arg.messages[0].content).toBe("my-prompt");
  });
});
