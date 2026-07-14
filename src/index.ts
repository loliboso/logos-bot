import { config } from "./config";
import { getDb, initDb } from "./db/connection";
import { createApp } from "./bot/app";
import { registerCommands } from "./bot/commands";
import { registerDmHandler } from "./bot/dm-handler";
import { RequestParser } from "./bot/request-parser";
import { BrandMatcher } from "./bot/brand-matcher";
import { ConversationManager } from "./bot/conversation";
import { ConversationStore } from "./bot/conversation-store";
import { AssetResolver } from "./bot/asset-resolver";
import { CatalogRepo } from "./catalog/catalog-repo";
import { OutputCache } from "./renderer/cache";
import { DriveClient } from "./scanner/drive-client";
import { loadBrandConfig } from "./config/brands-config";
import { mkdirSync } from "fs";
import { dirname } from "path";

async function main(): Promise<void> {
  mkdirSync(dirname(config.DATABASE_PATH), { recursive: true });
  const db = getDb(config.DATABASE_PATH);
  initDb(db);

  const repo = new CatalogRepo(db);
  const cache = new OutputCache(db);
  const brandConfig = loadBrandConfig();
  const allBrands = repo.getAllBrands();
  const matcher = new BrandMatcher(allBrands, brandConfig);
  const parser = new RequestParser(matcher);
  const conversationManager = new ConversationManager();
  const conversations = new ConversationStore();
  const resolver = new AssetResolver(repo);
  const driveClient = new DriveClient(config.GOOGLE_SERVICE_ACCOUNT_KEY);

  const app = createApp();

  registerCommands(app, parser, conversationManager, resolver, repo, conversations, driveClient);
  registerDmHandler(app, parser, conversationManager, resolver, repo, cache, driveClient, conversations);

  await app.start();
  console.log("⚡ Logo Bot is running");
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
