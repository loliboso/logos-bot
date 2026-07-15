import { google, drive_v3 } from "googleapis";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  modifiedTime: string;
  size: number;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
// Per-request network timeout (ms). Without it a hung connection blocks a whole
// scan forever — a stuck download once idled a scan for over 30 minutes. On
// timeout gaxios rejects, which the scanner catches (dimensions left null).
const REQUEST_TIMEOUT_MS = 30_000;
const SUPPORTED_MIMES = new Set([
  "image/svg+xml",
  "image/png",
  "application/postscript",
  "application/illustrator",
]);

export class DriveClient {
  private drive: drive_v3.Drive;

  constructor(serviceAccountKey: string) {
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
    this.drive = google.drive({ version: "v3", auth });
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;

    do {
      const res = await this.drive.files.list(
        {
          q: `'${folderId}' in parents and trashed = false`,
          fields: "nextPageToken, files(id, name, mimeType, parents, modifiedTime, size)",
          pageSize: 1000,
          pageToken,
          // Required for folders that live in a Shared Drive — without these the
          // API silently returns zero results for shared-drive content.
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
        { timeout: REQUEST_TIMEOUT_MS }
      );

      for (const f of res.data.files || []) {
        files.push({
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          parents: f.parents || [],
          modifiedTime: f.modifiedTime || "",
          size: parseInt(f.size || "0", 10),
        });
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    return files;
  }

  /** Download a file's raw bytes by id (used to extract dimensions / render). */
  async downloadFile(fileId: string): Promise<Buffer> {
    const res = await this.drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer", timeout: REQUEST_TIMEOUT_MS }
    );
    return Buffer.from(res.data as ArrayBuffer);
  }

  /** Public webViewLink for a file, so users can open the original in Drive. */
  async getWebViewLink(fileId: string): Promise<string | null> {
    const res = await this.drive.files.get(
      { fileId, fields: "webViewLink", supportsAllDrives: true },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    return res.data.webViewLink || null;
  }

  isFolder(file: DriveFile): boolean {
    return file.mimeType === FOLDER_MIME;
  }

  isSupported(file: DriveFile): boolean {
    return SUPPORTED_MIMES.has(file.mimeType);
  }
}
