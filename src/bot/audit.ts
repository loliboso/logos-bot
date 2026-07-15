import { CatalogRepo, DeliveryRecord } from "../catalog/catalog-repo";

/** A delivery to audit: the DB row plus a human label for the Slack notice. */
export type AuditEvent = DeliveryRecord & { assetLabel: string };

/** Minimal Slack client surface the notice needs. */
interface SlackLike {
  chat: { postMessage: (args: { channel: string; text: string }) => Promise<unknown> };
}

/**
 * Build the delivery-audit sink used by delivery.ts. It always writes the
 * SQLite row (the source of truth) and then, best-effort, posts a notice to the
 * configured reviewer channels/users. Neither step may throw into delivery: the
 * file has already been handed over, so a failed audit must not surface as an
 * error to the requester — it is logged and swallowed.
 */
export function createAuditSink(
  repo: CatalogRepo,
  client: SlackLike,
  notifyChannels: string[]
): (event: AuditEvent) => Promise<void> {
  return async (event: AuditEvent) => {
    const { assetLabel, ...row } = event;

    try {
      repo.recordDelivery(row);
    } catch (err) {
      console.error("Failed to record delivery audit row:", err);
    }

    if (notifyChannels.length === 0) return;
    const brandName = row.brand_id ? repo.getBrandById(row.brand_id)?.display_name : null;
    const text = buildNotice(event, brandName ?? row.brand_id ?? "(未知品牌)", assetLabel);
    for (const channel of notifyChannels) {
      try {
        await client.chat.postMessage({ channel, text });
      } catch (err) {
        console.error(`Failed to notify audit channel ${channel}:`, err);
      }
    }
  };
}

function buildNotice(row: DeliveryRecord, brandName: string, assetLabel: string): string {
  const size =
    row.width && row.height ? `${row.width}×${row.height}` : "原始尺寸";
  const fmt = (row.output_format ?? "").toUpperCase();
  const lines = [
    "🧾 *Logo 取用紀錄*",
    `• 取用者：<@${row.slack_user_id}>`,
    `• 品牌：${brandName}`,
    `• 檔案：\`${assetLabel}\`（${fmt}｜${size}）`,
    `• 用途：${row.purpose}`,
  ];
  if (row.purpose_url) lines.push(`• 連結：${row.purpose_url}`);
  return lines.join("\n");
}
