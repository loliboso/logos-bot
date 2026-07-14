import { ResolvedAsset } from "./asset-resolver";
import { validateDimensions, renderCustomSize } from "../renderer/renderer";
import { DriveClient } from "../scanner/drive-client";
import {
  buildDeliveryMessage,
  buildErrorMessage,
  buildWhiteLogoWarning,
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
  /**
   * Upload a file buffer to the conversation. Returns false when uploading is
   * not possible in this context (e.g. ephemeral slash-command responses), so
   * the caller can fall back to a "use DM" notice instead of a dead link.
   */
  uploadFile: (buffer: Buffer, filename: string, title: string) => Promise<boolean>;
  /** Max allowed output dimension (config.MAX_OUTPUT_SIZE). */
  maxOutputSize: number;
}

/**
 * Build the real ports from a DriveClient and a Slack say/respond function.
 * `uploadFile` is needed to send files back; when absent (e.g. ephemeral
 * slash-command responses that cannot carry file uploads), it resolves false
 * so delivery falls back to asking the user to DM the bot instead.
 */
export function createDeliveryPorts(opts: {
  driveClient: DriveClient;
  respond: (msg: any) => Promise<any>;
  maxOutputSize: number;
  uploadFile?: (buffer: Buffer, filename: string, title: string) => Promise<void>;
}): DeliveryPorts {
  return {
    respond: async (msg) => {
      await opts.respond(msg);
    },
    downloadSource: (fileId) => opts.driveClient.downloadFile(fileId),
    uploadFile: opts.uploadFile
      ? async (buffer, filename, title) => {
          await opts.uploadFile!(buffer, filename, title);
          return true;
        }
      : async () => false,
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
    // Direct download: upload the original file bytes to Slack. Employees do
    // not have access to the source Drive folder, so a Drive link would be a
    // dead end for them — the file itself has to travel through the bot.
    const source = await ports.downloadSource(asset.source_drive_file_id);
    const uploaded = await ports.uploadFile(source, fileName, fileName);
    if (!uploaded) {
      // Ephemeral slash-command context can't carry file uploads.
      await ports.respond(
        buildErrorMessage("目前無法在此情境傳送檔案，請直接私訊（DM）我來索取檔案。")
      );
      return;
    }
    if (asset.color === "white" && asset.background === "transparent") {
      await ports.respond(buildWhiteLogoWarning());
    }
    await ports.respond(buildDeliveryMessage(asset));
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
    background: result.background && result.background !== "transparent"
      ? result.background
      : "transparent",
  });

  const outName = `${asset.id}-${width}x${height}.png`;
  const uploaded = await ports.uploadFile(rendered.buffer, outName, fileName);
  if (!uploaded) {
    await ports.respond(
      buildErrorMessage("目前無法在此情境傳送檔案，請直接私訊（DM）我來索取自訂尺寸。")
    );
    return;
  }
  if (
    asset.color === "white" &&
    asset.background === "transparent" &&
    (!result.background || result.background === "transparent")
  ) {
    await ports.respond(buildWhiteLogoWarning());
  }
  await ports.respond(buildDeliveryMessage(asset, { width, height }));
}
