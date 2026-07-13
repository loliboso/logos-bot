import { App } from "@slack/bolt";
import { RequestParser } from "./request-parser";
import { ConversationManager } from "./conversation";
import { ConversationStore } from "./conversation-store";
import { AssetResolver } from "./asset-resolver";
import { CatalogRepo } from "../catalog/catalog-repo";
import { OutputCache } from "../renderer/cache";
import { buildQuestionMessage, buildErrorMessage } from "./response-builder";
import { buildNoMatchMessage } from "./no-match";
import { config } from "../config";
import { DriveClient } from "../scanner/drive-client";
import { createDeliveryPorts, handleResolvedAsset } from "./delivery";

/**
 * Post an immediate "processing" notice so the user isn't staring at silence
 * during the ~20s round trip (AI parse + Drive download + Slack upload).
 * Returns a best-effort cleanup that removes it once the real reply is out; a
 * failed delete (e.g. missing scope) is swallowed so it never breaks delivery.
 */
async function postProcessing(
  client: { chat: { postMessage: (a: any) => Promise<any>; delete: (a: any) => Promise<any> } },
  channelId: string
): Promise<() => Promise<void>> {
  let ts: string | undefined;
  try {
    const res = await client.chat.postMessage({ channel: channelId, text: "🔍 收到！正在為你處理，請稍等…" });
    ts = res?.ts as string | undefined;
  } catch {
    /* if we can't even post the notice, just proceed without it */
  }
  return async () => {
    if (!ts) return;
    try {
      await client.chat.delete({ channel: channelId, ts });
    } catch {
      /* leaving the notice in place is harmless */
    }
  };
}

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

    const pendingState = conversations.get(userId);
    if (pendingState?.awaitingCustomSize) {
      const state = conversationManager.applyCustomSizeInput(pendingState, text);
      if (!state) {
        await say(buildErrorMessage("請以「寬x高」輸入尺寸，例如 800x600。"));
        return;
      }

      // Custom-size rendering downloads + renders + uploads: show a notice.
      const clearNotice = await postProcessing(client as any, channelId);
      try {
        const result = resolver.resolve(state);
        if (!result) {
          const noMatch = buildNoMatchMessage(state, repo);
          if (noMatch.state) conversations.set(userId, noMatch.state);
          else conversations.delete(userId);
          await say(noMatch.message);
          return;
        }
        conversations.delete(userId);

        const ports = createDeliveryPorts({
          driveClient,
          respond: say,
          maxOutputSize: config.MAX_OUTPUT_SIZE,
          uploadFile: async (buffer, filename, title) => {
            await client.files.uploadV2({ channel_id: channelId, file: buffer, filename, title });
          },
        });
        await handleResolvedAsset(result, ports);
      } finally {
        await clearNotice();
      }
      return;
    }

    // A fresh request: the AI parse alone is a few seconds, and delivery adds a
    // Drive download + upload. Post the notice before any of that work starts.
    const clearNotice = await postProcessing(client as any, channelId);
    try {
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
            uploadFile: async (buffer, filename, title) => {
              await client.files.uploadV2({ channel_id: channelId, file: buffer, filename, title });
            },
          });
          await handleResolvedAsset(result, ports);
        } else {
          const noMatch = buildNoMatchMessage(state, repo);
          if (noMatch.state) conversations.set(userId, noMatch.state);
          await say(noMatch.message);
        }
        return;
      }

      if (question) {
        conversations.set(userId, state);
        await say(buildQuestionMessage(question));
      } else {
        await say(buildErrorMessage("無法辨識品牌，請指定品牌名稱，例如「TNL」或「關鍵評論網」。"));
      }
    } finally {
      await clearNotice();
    }
  });
}
