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
import { createAuditSink } from "./audit";

export function registerCommands(
  app: App,
  _parser: RequestParser,
  conversationManager: ConversationManager,
  resolver: AssetResolver,
  repo: CatalogRepo,
  conversations: ConversationStore,
  driveClient: DriveClient
): void {
  // The /logos slash command is intentionally just a redirect to DM. A guided
  // request needs free-text replies (usage purpose, custom size), and Slack
  // only delivers plain messages to the bot inside a DM with it. A slash flow
  // started in a channel or the user's own space can click buttons but its
  // typed replies never reach the bot, dead-ending the flow — so require a DM.
  app.command("/logos", async ({ ack, respond }) => {
    await ack();
    await respond(
      "👋 請直接*私訊我（DM LogosBot）*來索取 Logo。\n" +
        "在這裡用指令沒辦法完成需要打字的步驟（用途、自訂尺寸），請開啟私訊後直接輸入品牌名稱即可（例如：`TNL Mediagene`）。"
    );
  });

  // Button action handler
  app.action(/^select_/, async ({ action, ack, respond, body, client }) => {
    await ack();
    const userId = body.user.id;
    const state = conversations.get(userId);
    if (!state) {
      await respond(buildErrorMessage("對話已過期，請重新輸入。"));
      return;
    }

    // action_id is `select_${field}_${value}`. Field names contain underscores
    // (e.g. asset_type, brand_id) and so do some values, so a regex split is
    // ambiguous. The button's own `value` is authoritative — strip it (plus the
    // "select_" prefix and the joining "_") to recover the field exactly.
    const actionId = (action as any).action_id as string;
    const value = (action as any).value as string;
    if (typeof value !== "string" || !actionId.startsWith("select_")) return;
    const field = actionId.slice("select_".length, actionId.length - value.length - 1);
    if (!field) return;

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
          recordDelivery: createAuditSink(repo, client as any, config.AUDIT_NOTIFY_CHANNELS),
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
