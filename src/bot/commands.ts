import { App } from "@slack/bolt";
import { RequestParser } from "./request-parser";
import { ConversationManager } from "./conversation";
import { ConversationStore } from "./conversation-store";
import { AssetResolver } from "./asset-resolver";
import { CatalogRepo, BrandRecord } from "../catalog/catalog-repo";
import { buildQuestionMessage, buildErrorMessage } from "./response-builder";
import { buildNoMatchMessage } from "./no-match";
import { DriveClient } from "../scanner/drive-client";
import { config } from "../config";
import { createDeliveryPorts, handleResolvedAsset } from "./delivery";

export function registerCommands(
  app: App,
  parser: RequestParser,
  conversationManager: ConversationManager,
  resolver: AssetResolver,
  repo: CatalogRepo,
  conversations: ConversationStore,
  driveClient: DriveClient
): void {
  app.command("/logos", async ({ command, ack, respond }) => {
    await ack();
    const text = command.text.trim();
    if (!text) {
      await respond(buildErrorMessage("請輸入你需要的 Logo 描述，例如：/logos TNL 藍色 SVG"));
      return;
    }

    const parsed = parser.parseUserRequest(text);
    const state = conversationManager.startConversation(command.user_id, command.channel_id, parsed);

    const brands = parsed.brandCandidates
      .map((id) => repo.getBrandById(id))
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (parsed.brand) state.resolvedBrandId = parsed.brand;

    const assets = state.resolvedBrandId ? repo.getActiveAssets(state.resolvedBrandId) : [];
    const question = conversationManager.getNextQuestion(state, brands, assets);

    if (!question && conversationManager.isComplete(state)) {
      const result = resolver.resolve(state);
      if (result) {
        // Slash-command responses are ephemeral and can't upload files. With no
        // uploadFile provided, delivery falls back to asking the user to DM the
        // bot instead of handing back an inaccessible Drive link.
        const ports = createDeliveryPorts({
          driveClient,
          respond,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
        });
        await handleResolvedAsset(result, ports);
      } else {
        const noMatch = buildNoMatchMessage(state, repo);
        if (noMatch.state) conversations.set(command.user_id, noMatch.state);
        await respond(noMatch.message);
      }
      return;
    }

    if (question) {
      conversations.set(command.user_id, state);
      await respond(buildQuestionMessage(question));
    } else {
      await respond(buildErrorMessage("無法辨識品牌，請指定品牌名稱。"));
    }
  });

  // Button action handler
  app.action(/^select_(.+)_(.+)$/, async ({ action, ack, respond, body, client }) => {
    await ack();
    const userId = body.user.id;
    const state = conversations.get(userId);
    if (!state) {
      await respond(buildErrorMessage("對話已過期，請重新輸入。"));
      return;
    }

    const actionId = (action as any).action_id as string;
    const match = actionId.match(/^select_(.+?)_(.+)$/);
    if (!match) return;
    const [, field, value] = match;

    const updated = conversationManager.applyAnswer(state, field, value);
    const brands: BrandRecord[] = updated.resolvedBrandId
      ? [repo.getBrandById(updated.resolvedBrandId)].filter((b): b is NonNullable<typeof b> => b !== null)
      : updated.parsed.brandCandidates
          .map((id) => repo.getBrandById(id))
          .filter((b): b is NonNullable<typeof b> => b !== null);
    const assets = updated.resolvedBrandId ? repo.getActiveAssets(updated.resolvedBrandId) : [];
    const question = conversationManager.getNextQuestion(updated, brands, assets);

    if (!question && conversationManager.isComplete(updated)) {
      const result = resolver.resolve(updated);
      if (result) {
        conversations.delete(userId);
        const channelId = (body as any).channel?.id as string | undefined;
        const ports = createDeliveryPorts({
          driveClient,
          respond,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
          uploadFile: channelId
            ? async (buffer, filename, title) => {
                await client.files.uploadV2({ channel_id: channelId, file: buffer, filename, title });
              }
            : undefined,
        });
        await handleResolvedAsset(result, ports);
      } else {
        const noMatch = buildNoMatchMessage(updated, repo);
        if (noMatch.state) conversations.set(userId, noMatch.state);
        else conversations.delete(userId);
        await respond(noMatch.message);
      }
      return;
    }

    if (question) {
      conversations.set(userId, updated);
      await respond(buildQuestionMessage(question));
    }
  });
}
