import { describe, it, expect } from "vitest";
import { buildQuestionMessage, buildDeliveryMessage, buildWhiteLogoWarning, buildErrorMessage } from "../../src/bot/response-builder";
import { Question } from "../../src/bot/conversation";
import { AssetRecord } from "../../src/catalog/catalog-repo";

describe("buildQuestionMessage", () => {
  it("renders button options for small option sets", () => {
    const question: Question = {
      text: "要哪個版本？",
      field: "color",
      options: [
        { label: "主色（藍）", value: "blue" },
        { label: "白色", value: "white" },
      ],
    };
    const msg = buildQuestionMessage(question);
    expect(msg.text).toBe("要哪個版本？");
    expect(msg.blocks).toHaveLength(2);
    expect(msg.blocks![1].type).toBe("actions");
    expect(msg.blocks![1].elements).toHaveLength(2);
  });

  it("falls back to text-only for no options", () => {
    const question: Question = { text: "請輸入自訂尺寸（例如 800x600）：", field: "custom_size" };
    const msg = buildQuestionMessage(question);
    expect(msg.text).toBe("請輸入自訂尺寸（例如 800x600）：");
    expect(msg.blocks).toBeUndefined();
  });
});

describe("buildDeliveryMessage", () => {
  const asset: AssetRecord = {
    id: "test",
    brand_id: "the-news-lens",
    asset_type: "logo",
    variant: "logo",
    language: null,
    format: "svg",
    color: "blue",
    background: "transparent",
    layout: null,
    usage: ["general"],
    source_drive_file_id: "f1",
    source_path: "The News Lens 關鍵評論網/SVG/logo-blue.svg",
    intrinsic_width: 300,
    intrinsic_height: 100,
    can_resize: true,
    status: "active",
    confidence: 0.9,
    inferred_from: [],
    review_status: "accepted",
    review_reason: null,
    scanner_run_id: null,
  };

  it("formats original asset delivery", () => {
    const msg = buildDeliveryMessage(asset);
    expect(msg.text).toContain("logo-blue.svg");
    expect(msg.text).toContain("SVG");
  });

  it("formats custom-size delivery", () => {
    const msg = buildDeliveryMessage(asset, { width: 500, height: 500 });
    expect(msg.text).toContain("500 x 500");
    expect(msg.text).toContain("等比例置中");
    expect(msg.text).toContain("logo-blue.svg");
  });
});

describe("buildWhiteLogoWarning", () => {
  it("includes warning about white transparent logo", () => {
    const msg = buildWhiteLogoWarning();
    expect(msg.text).toContain("白色透明");
  });
});

describe("buildErrorMessage", () => {
  it("formats error in Mandarin", () => {
    const msg = buildErrorMessage("找不到符合條件的 Logo。");
    expect(msg.text).toContain("找不到");
  });
});
