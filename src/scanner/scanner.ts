import { DriveClient, DriveFile } from "./drive-client";

export interface DriveFolder {
  id: string;
  name: string;
  path: string;
}

export interface ScannedFile {
  id: string;
  name: string;
  mimeType: string;
  parentFolderId: string;
  parentPath: string;
  modifiedTime: string;
  size: number;
  folderSemantics: FolderSemantics;
}

export type FolderSemantics = "normal" | "archive" | "campaign";

export interface ScanResult {
  folders: DriveFolder[];
  files: ScannedFile[];
  scannedAt: string;
}

const ARCHIVE_PATTERNS = ["封存", "@封存"];
const CAMPAIGN_PATTERNS = ["週年", "CI", "活動"];

export function classifyFolder(name: string): FolderSemantics {
  if (ARCHIVE_PATTERNS.some((p) => name.includes(p))) return "archive";
  if (CAMPAIGN_PATTERNS.some((p) => name.includes(p))) return "campaign";
  return "normal";
}

export async function scanDriveRoot(
  client: DriveClient,
  rootFolderId: string
): Promise<ScanResult> {
  const folders: DriveFolder[] = [];
  const files: ScannedFile[] = [];
  const scannedAt = new Date().toISOString();

  async function walk(folderId: string, path: string, semantics: FolderSemantics): Promise<void> {
    const entries = await client.listFolder(folderId);

    for (const entry of entries) {
      if (client.isFolder(entry)) {
        const folderPath = path ? `${path}/${entry.name}` : entry.name;
        const folderSemantics = classifyFolder(entry.name);
        const effectiveSemantics = semantics !== "normal" ? semantics : folderSemantics;
        folders.push({ id: entry.id, name: entry.name, path: folderPath });
        await walk(entry.id, folderPath, effectiveSemantics);
      } else if (client.isSupported(entry)) {
        files.push({
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          parentFolderId: folderId,
          parentPath: path,
          modifiedTime: entry.modifiedTime,
          size: entry.size,
          folderSemantics: semantics !== "normal" ? semantics : classifyFolder(path),
        });
      }
    }
  }

  await walk(rootFolderId, "", "normal");
  return { folders, files, scannedAt };
}
