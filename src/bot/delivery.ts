import { ResolvedAsset } from "./asset-resolver";
import { validateDimensions, renderCustomSize } from "../renderer/renderer";
import { DriveClient } from "../scanner/drive-client";
import {
  buildDeliveryMessage,
  buildErrorMessage,
  buildWhiteLogoWarning,
  buildLinkMessage,
} from "./response-builder";

/**
 * Side-effecting operations delivery needs, injected so the core logic stays
 * testable without Slack or Drive. Registration wires these to the real
 * DriveClient and Slack client.
 */
export interface DeliveryPorts {
  /** Post a message back to the user (Slack say/respond). */
  respond: (msg: any) => Promise<void>;
  /** Download a Drive file's raw bytes by file id. */
  downloadSource: (driveFileId: string) => Promise<Buffer>;
  /** Get a shareable Drive link for a file id (null if unavailable). */
  getLink: (driveFileId: string) => Promise<string | null>;
  /** Upload a rendered PNG buffer to the conversation. */
  uploadPng: (buffer: Buffer, filename: string, title: string) => Promise<void>;
  /** Max allowed output dimension (config.MAX_OUTPUT_SIZE). */
  maxOutputSize: number;
}

/**
 * Build the real ports from a DriveClient and a Slack say/respond function.
 * `slackClient` and `channelId` are needed to upload files; when absent (e.g.
 * ephemeral slash-command responses), custom-size upload is unavailable and we
 * fall back to a text notice.
 */
export function createDeliveryPorts(opts: {
  driveClient: DriveClient;
  respond: (msg: any) => Promise<any>;
  maxOutputSize: number;
  uploadPng?: (buffer: Buffer, filename: string, title: string) => Promise<void>;
}): DeliveryPorts {
  return {
    respond: async (msg) => {
      await opts.respond(msg);
    },
    downloadSource: (fileId) => opts.driveClient.downloadFile(fileId),
    getLink: (fileId) => opts.driveClient.getWebViewLink(fileId),
    uploadPng:
      opts.uploadPng ||
      (async () => {
        await opts.respond(
          buildErrorMessage("目前無法在此情境上傳檔案，請改用私訊（DM）索取自訂尺寸。")
        );
      }),
    maxOutputSize: opts.maxOutputSize,
  };
}

export async function handleResolvedAsset(
  result: ResolvedAsset,
  ports: DeliveryPorts
): Promise<void> {
  const { asset } = result;
  const fileName = asset.source_path.split("/").pop() || asset.id;

  if (!result.needsCustomSize) {
    // Direct download: hand back the original file via its Drive link.
    if (asset.color === "white" && asset.background === "transparent") {
      await ports.respond(buildWhiteLogoWarning());
    }
    const link = await ports.getLink(asset.source_drive_file_id);
    await ports.respond(buildDeliveryMessage(asset));
    if (link) {
      await ports.respond(buildLinkMessage(link, fileName));
    }
    return;
  }

  const width = result.requestedWidth!;
  const height = result.requestedHeight!;
  const validation = validateDimensions(width, height, ports.maxOutputSize);
  if (!validation.valid) {
    await ports.respond(buildErrorMessage(validation.error!));
    return;
  }

  // Custom size: download the source, render to the requested canvas, upload PNG.
  const source = await ports.downloadSource(asset.source_drive_file_id);
  const sourceFormat = asset.format === "svg" ? "svg" : "png";
  const rendered = await renderCustomSize({
    source,
    sourceFormat,
    width,
    height,
    background: asset.background === "transparent" ? "transparent" : asset.background,
  });

  const outName = `${asset.id}-${width}x${height}.png`;
  await ports.uploadPng(rendered.buffer, outName, fileName);
  if (asset.color === "white" && asset.background === "transparent") {
    await ports.respond(buildWhiteLogoWarning());
  }
  await ports.respond(buildDeliveryMessage(asset, { width, height }));
}
