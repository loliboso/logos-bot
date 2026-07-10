import { ConversationState } from "./conversation";

/**
 * Shared in-memory store for in-flight conversations, keyed by Slack user id.
 *
 * Both the slash-command/button handler and the DM handler must share a single
 * instance so that a conversation started in one (e.g. a DM question) can be
 * found by the other (e.g. a button click). Previously each handler kept its
 * own Map, so multi-turn flows broke when the follow-up arrived on a different
 * handler.
 */
export class ConversationStore {
  private conversations = new Map<string, ConversationState>();

  get(userId: string): ConversationState | undefined {
    return this.conversations.get(userId);
  }

  set(userId: string, state: ConversationState): void {
    this.conversations.set(userId, state);
  }

  delete(userId: string): void {
    this.conversations.delete(userId);
  }
}
