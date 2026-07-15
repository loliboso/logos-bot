import { describe, it, expect, vi } from "vitest";
import { createAuditSink, AuditEvent } from "../../src/bot/audit";

const event: AuditEvent = {
  slack_user_id: "U123",
  brand_id: "the-news-lens",
  asset_id: "svg-blue",
  output_format: "png",
  width: 500,
  height: 500,
  background: "white",
  padding_ratio: 0.2,
  purpose: "社群貼文",
  purpose_url: "https://tnl.tw/p/1",
  assetLabel: "logo-blue.svg",
};

function fakeRepo(overrides: any = {}) {
  return {
    recordDelivery: vi.fn(),
    getBrandById: vi.fn(() => ({ display_name: "關鍵評論網" })),
    ...overrides,
  } as any;
}

describe("createAuditSink", () => {
  it("writes the DB row (without the display-only assetLabel) and notifies each channel", async () => {
    const repo = fakeRepo();
    const client = { chat: { postMessage: vi.fn().mockResolvedValue({}) } };
    const sink = createAuditSink(repo, client as any, ["C1", "U2"]);

    await sink(event);

    // recordDelivery gets the DeliveryRecord — assetLabel stripped
    expect(repo.recordDelivery).toHaveBeenCalledTimes(1);
    const row = repo.recordDelivery.mock.calls[0][0];
    expect(row.assetLabel).toBeUndefined();
    expect(row.slack_user_id).toBe("U123");
    expect(row.purpose_url).toBe("https://tnl.tw/p/1");

    // one notice per channel, mentioning the requester, brand name, purpose
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2);
    const text = client.chat.postMessage.mock.calls[0][0].text as string;
    expect(text).toContain("<@U123>");
    expect(text).toContain("關鍵評論網");
    expect(text).toContain("社群貼文");
    expect(text).toContain("logo-blue.svg");
  });

  it("does not notify when no channels are configured, but still records", async () => {
    const repo = fakeRepo();
    const client = { chat: { postMessage: vi.fn() } };
    await createAuditSink(repo, client as any, [])(event);
    expect(repo.recordDelivery).toHaveBeenCalledTimes(1);
    expect(client.chat.postMessage).not.toHaveBeenCalled();
  });

  it("swallows a notify failure (delivery already happened)", async () => {
    const repo = fakeRepo();
    const client = { chat: { postMessage: vi.fn().mockRejectedValue(new Error("no scope")) } };
    await expect(createAuditSink(repo, client as any, ["C1"])(event)).resolves.toBeUndefined();
    expect(repo.recordDelivery).toHaveBeenCalledTimes(1);
  });

  it("swallows a DB write failure without throwing", async () => {
    const repo = fakeRepo({ recordDelivery: vi.fn(() => { throw new Error("db locked"); }) });
    const client = { chat: { postMessage: vi.fn().mockResolvedValue({}) } };
    await expect(createAuditSink(repo, client as any, ["C1"])(event)).resolves.toBeUndefined();
    // notify still attempted despite the DB error
    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
  });
});
