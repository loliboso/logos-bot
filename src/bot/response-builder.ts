import { Question } from "./conversation";
import { AssetRecord } from "../catalog/catalog-repo";

export interface SlackMessage {
  text: string;
  blocks?: any[];
}

export function buildQuestionMessage(question: Question): SlackMessage {
  if (question.options && question.options.length <= 5) {
    return {
      text: question.text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: question.text } },
        {
          type: "actions",
          elements: question.options.map((opt) => ({
            type: "button",
            text: { type: "plain_text", text: opt.label },
            action_id: `select_${question.field}_${opt.value}`,
            value: opt.value,
          })),
        },
      ],
    };
  }

  return { text: question.text };
}

export function buildDeliveryMessage(
  asset: AssetRecord,
  customSize?: { width: number; height: number }
): SlackMessage {
  const fileName = asset.source_path.split("/").pop() || asset.id;

  if (customSize) {
    const text = `已產出 ${customSize.width} x ${customSize.height} PNG，Logo 已等比例置中，來源：${fileName}`;
    return {
      text,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `✓ ${text}` } },
        {
          type: "context",
          elements: [
            { type: "mrkdwn", text: `格式：PNG | 尺寸：${customSize.width}×${customSize.height} | 來源：\`${fileName}\`` },
          ],
        },
      ],
    };
  }

  const text = `${asset.format.toUpperCase()} — ${fileName}`;
  return {
    text,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `✓ ${text}` } },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `格式：${asset.format.toUpperCase()} | 顏色：${asset.color || "未指定"} | 來源：\`${fileName}\`` },
        ],
      },
    ],
  };
}

export function buildWhiteLogoWarning(): SlackMessage {
  return {
    text: "提醒：此 Logo 為白色透明背景，預覽可能不易辨識，但下載的檔案是正確的。",
    blocks: [
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "⚠️ 此 Logo 為白色透明背景，預覽可能不易辨識，但下載的檔案是正確的。" },
        ],
      },
    ],
  };
}

export function buildErrorMessage(error: string): SlackMessage {
  return {
    text: error,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `❌ ${error}` } },
    ],
  };
}
