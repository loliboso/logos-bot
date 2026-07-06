import "dotenv/config";

export const config = {
  SLACK_BOT_TOKEN: requireEnv("SLACK_BOT_TOKEN"),
  SLACK_SIGNING_SECRET: requireEnv("SLACK_SIGNING_SECRET"),
  SLACK_APP_TOKEN: requireEnv("SLACK_APP_TOKEN"),
  GOOGLE_SERVICE_ACCOUNT_KEY: requireEnv("GOOGLE_SERVICE_ACCOUNT_KEY"),
  DRIVE_ROOT_FOLDER_ID: requireEnv("DRIVE_ROOT_FOLDER_ID"),
  ANTHROPIC_API_KEY: requireEnv("ANTHROPIC_API_KEY"),
  DATABASE_PATH: process.env.DATABASE_PATH || "./data/catalog.db",
  MAX_OUTPUT_SIZE: parseInt(process.env.MAX_OUTPUT_SIZE || "4000", 10),
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
