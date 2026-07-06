import { App } from "@slack/bolt";
import { RequestParser } from "./request-parser";
import { ConversationManager, ConversationState } from "./conversation";
import { AssetResolver, ResolvedAsset } from "./asset-resolver";
import { CatalogRepo } from "../catalog/catalog-repo";
import { validateDimensions } from "../renderer/renderer";
import { OutputCache } from "../renderer/cache";
import { buildQuestionMessage, buildDeliveryMessage, buildErrorMessage, buildWhiteLogoWarning } from "./response-builder";
import { config } from "../config";
import { DriveClient } from "../scanner/drive-client";

const conversations = new Map<string, ConversationState>();

export function registerDmHandler(
  app: App,
  parser: RequestParser,
  conversationManager: ConversationManager,
  resolver: AssetResolver,
  repo: CatalogRepo,
  _cache: OutputCache,
  _driveClient: DriveClient
): void {
  app.message(async ({ message, say }) => {
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
        await handleResolvedAsset(result, say);
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

export async function handleResolvedAsset(
  result: ResolvedAsset,
  respond: (msg: any) => Promise<any>
): Promise<void> {
  if (!result.needsCustomSize) {
    const msg = buildDeliveryMessage(result.asset);
    if (result.asset.color === "white" && result.asset.background === "transparent") {
      await respond(buildWhiteLogoWarning());
    }
    await respond(msg);
    return;
  }

  const width = result.requestedWidth!;
  const height = result.requestedHeight!;
  const validation = validateDimensions(width, height, config.MAX_OUTPUT_SIZE);
  if (!validation.valid) {
    await respond(buildErrorMessage(validation.error!));
    return;
  }

  const msg = buildDeliveryMessage(result.asset, { width, height });
  await respond(msg);
}
