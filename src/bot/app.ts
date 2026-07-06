import { App } from "@slack/bolt";
import { config } from "../config";

export function createApp(): App {
  return new App({
    token: config.SLACK_BOT_TOKEN,
    signingSecret: config.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: config.SLACK_APP_TOKEN,
  });
}
