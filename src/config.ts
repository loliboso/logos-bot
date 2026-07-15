import "dotenv/config";
import { readFileSync } from "fs";

/**
 * Resolve the Google service account key from either a file path
 * (GOOGLE_SERVICE_ACCOUNT_KEY_PATH — preferred, keeps the secret out of .env
 * and out of git) or an inline JSON string (GOOGLE_SERVICE_ACCOUNT_KEY).
 */
export function resolveServiceAccountKey(
  env: NodeJS.ProcessEnv = process.env
): string {
  const path = env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  if (path) {
    return readFileSync(path, "utf-8");
  }
  const inline = env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (inline) {
    return inline;
  }
  throw new Error(
    "Missing Google credentials: set GOOGLE_SERVICE_ACCOUNT_KEY_PATH (path to the service account JSON file) or GOOGLE_SERVICE_ACCOUNT_KEY (inline JSON)."
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

/**
 * Config is exposed via lazy getters so that a command only needing a subset of
 * the environment (e.g. `scan`, which needs Google + Anthropic but not Slack)
 * doesn't throw on unrelated missing vars at import time.
 */
export const config = {
  get SLACK_BOT_TOKEN(): string {
    return requireEnv("SLACK_BOT_TOKEN");
  },
  get SLACK_SIGNING_SECRET(): string {
    return requireEnv("SLACK_SIGNING_SECRET");
  },
  get SLACK_APP_TOKEN(): string {
    return requireEnv("SLACK_APP_TOKEN");
  },
  get GOOGLE_SERVICE_ACCOUNT_KEY(): string {
    return resolveServiceAccountKey();
  },
  get DRIVE_ROOT_FOLDER_ID(): string {
    return requireEnv("DRIVE_ROOT_FOLDER_ID");
  },
  get ANTHROPIC_API_KEY(): string {
    return requireEnv("ANTHROPIC_API_KEY");
  },
  get DATABASE_PATH(): string {
    return process.env.DATABASE_PATH || "./data/catalog.db";
  },
  get MAX_OUTPUT_SIZE(): number {
    return parseInt(process.env.MAX_OUTPUT_SIZE || "4000", 10);
  },
  /**
   * Slack channel/user IDs (comma-separated) that receive a notice each time a
   * logo is delivered — the design/PR colleagues doing the informal misuse
   * check. Empty means "log to the DB only, notify no one". Optional so the bot
   * runs fine before it's configured.
   */
  get AUDIT_NOTIFY_CHANNELS(): string[] {
    return (process.env.AUDIT_NOTIFY_CHANNELS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
