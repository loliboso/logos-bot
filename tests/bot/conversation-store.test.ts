import { describe, it, expect } from "vitest";
import { ConversationStore } from "../../src/bot/conversation-store";
import { ConversationState } from "../../src/bot/conversation";
import { ParsedRequest } from "../../src/bot/request-parser";

function makeState(userId: string): ConversationState {
  const parsed: ParsedRequest = {
    brand: "TNL", format: null, color: null, language: null,
    asset_type: null, width: null, height: null, raw_text: "test",
  };
  return {
    userId,
    channelId: "ch1",
    parsed,
    resolvedBrandId: null,
    resolvedAssetId: null,
    step: "brand_select",
    startedAt: "2026-07-10T00:00:00.000Z",
  };
}

describe("ConversationStore", () => {
  it("stores and retrieves a conversation by user id", () => {
    const store = new ConversationStore();
    const state = makeState("user1");
    store.set("user1", state);
    expect(store.get("user1")).toBe(state);
  });

  it("returns undefined for an unknown user", () => {
    const store = new ConversationStore();
    expect(store.get("nobody")).toBeUndefined();
  });

  it("deletes a conversation", () => {
    const store = new ConversationStore();
    store.set("user1", makeState("user1"));
    store.delete("user1");
    expect(store.get("user1")).toBeUndefined();
  });

  it("shares state across handlers using the same instance", () => {
    // Simulates: DM handler writes, button handler reads — same store instance.
    const store = new ConversationStore();
    const state = makeState("user1");
    store.set("user1", state); // written by dm-handler
    const seenByButtonHandler = store.get("user1"); // read by commands handler
    expect(seenByButtonHandler).toBe(state);
  });
});
