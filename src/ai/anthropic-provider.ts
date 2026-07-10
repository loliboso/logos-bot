import Anthropic from "@anthropic-ai/sdk";
import { AiProvider, StructuredRequest } from "./provider";

// Current, valid Claude model id (the source plan referenced a stale id).
const AI_MODEL = "claude-sonnet-5";

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateStructured(req: StructuredRequest): Promise<Record<string, any> | null> {
    const response = await this.client.messages.create({
      model: AI_MODEL,
      max_tokens: req.maxTokens ?? 1024,
      messages: [{ role: "user", content: req.prompt }],
      tools: [
        {
          name: req.toolName,
          description: req.toolDescription,
          input_schema: req.schema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: req.toolName },
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return null;
    }
    return toolBlock.input as Record<string, any>;
  }
}
