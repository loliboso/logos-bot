import { App } from "@slack/bolt";
import { RequestParser } from "./request-parser";
import { ConversationManager } from "./conversation";
import { ConversationStore } from "./conversation-store";
import { AssetResolver } from "./asset-resolver";
import { CatalogRepo, BrandRecord } from "../catalog/catalog-repo";
import { buildQuestionMessage, buildErrorMessage } from "./response-builder";
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

    const parsed = await parser.parseUserRequest(text);
    const state = conversationManager.startConversation(command.user_id, command.channel_id, parsed);

    const brands = parsed.brand ? repo.findBrandByAlias(parsed.brand) : [];
    if (brands.length === 1) state.resolvedBrandId = brands[0].id;

    const assets = state.resolvedBrandId ? repo.getActiveAssets(state.resolvedBrandId) : [];
    const question = conversationManager.getNextQuestion(state, brands, assets);

    if (!question && conversationManager.isComplete(state)) {
      const result = resolver.resolve(state);
      if (result) {
        // Slash-command responses are ephemeral and can't upload files; a
        // custom-size request here is told to use DM instead (handled by the
        // default uploadPng fallback in createDeliveryPorts).
        const ports = createDeliveryPorts({
          driveClient,
          respond,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
        });
        await handleResolvedAsset(result, ports);
      } else {
        await respond(buildErrorMessage("找不到符合條件的 Logo，請嘗試其他描述。"));
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
      ? [{ id: updated.resolvedBrandId } as BrandRecord]
      : repo.findBrandByAlias(updated.parsed.brand || "");
    const assets = updated.resolvedBrandId ? repo.getActiveAssets(updated.resolvedBrandId) : [];
    const question = conversationManager.getNextQuestion(updated, brands, assets);

    if (!question && conversationManager.isComplete(updated)) {
      conversations.delete(userId);
      const result = resolver.resolve(updated);
      if (result) {
        const channelId = (body as any).channel?.id as string | undefined;
        const ports = createDeliveryPorts({
          driveClient,
          respond,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
          uploadPng: channelId
            ? async (buffer, filename, title) => {
                await client.files.uploadV2({ channel_id: channelId, file: buffer, filename, title });
              }
            : undefined,
        });
        await handleResolvedAsset(result, ports);
      } else {
        await respond(buildErrorMessage("找不到符合條件的 Logo。"));
      }
      return;
    }

    if (question) {
      conversations.set(userId, updated);
      await respond(buildQuestionMessage(question));
    }
  });
}
