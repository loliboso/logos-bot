import { App } from "@slack/bolt";
import { RequestParser } from "./request-parser";
import { ConversationManager } from "./conversation";
import { ConversationStore } from "./conversation-store";
import { AssetResolver } from "./asset-resolver";
import { CatalogRepo } from "../catalog/catalog-repo";
import { OutputCache } from "../renderer/cache";
import { buildQuestionMessage, buildErrorMessage } from "./response-builder";
import { config } from "../config";
import { DriveClient } from "../scanner/drive-client";
import { createDeliveryPorts, handleResolvedAsset } from "./delivery";

export function registerDmHandler(
  app: App,
  parser: RequestParser,
  conversationManager: ConversationManager,
  resolver: AssetResolver,
  repo: CatalogRepo,
  _cache: OutputCache,
  driveClient: DriveClient,
  conversations: ConversationStore
): void {
  app.message(async ({ message, say, client }) => {
    if (message.subtype || !("text" in message)) return;
    const text = (message as any).text as string;
    const userId = (message as any).user as string;
    const channelId = (message as any).channel as string;

    const parsed = await parser.parseUserRequest(text);
    const state = conversationManager.startConversation(userId, channelId, parsed);

    const brands = parsed.brand ? repo.findBrandByAlias(parsed.brand) : [];
    if (brands.length === 1) state.resolvedBrandId = brands[0].id;

    const assets = state.resolvedBrandId ? repo.getActiveAssets(state.resolvedBrandId) : [];
    const question = conversationManager.getNextQuestion(state, brands, assets);

    if (!question && conversationManager.isComplete(state)) {
      const result = resolver.resolve(state);
      if (result) {
        const ports = createDeliveryPorts({
          driveClient,
          respond: say,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
          uploadPng: async (buffer, filename, title) => {
            await client.files.uploadV2({ channel_id: channelId, file: buffer, filename, title });
          },
        });
        await handleResolvedAsset(result, ports);
      } else {
        await say(buildErrorMessage("找不到符合條件的 Logo，請嘗試其他描述。"));
      }
      return;
    }

    if (question) {
      conversations.set(userId, state);
      await say(buildQuestionMessage(question));
    } else {
      await say(buildErrorMessage("無法辨識品牌，請指定品牌名稱，例如「TNL」或「關鍵評論網」。"));
    }
  });
}
