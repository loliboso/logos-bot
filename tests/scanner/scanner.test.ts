import { describe, it, expect } from "vitest";
import { classifyFolder, scanDriveRoot, ScannedFile } from "../../src/scanner/scanner";
import { DriveClient, DriveFile } from "../../src/scanner/drive-client";
import fixture from "../../fixtures/drive-listing.json";

describe("classifyFolder", () => {
  it("classifies 封存 as archive", () => {
    expect(classifyFolder("封存")).toBe("archive");
  });

  it("classifies @封存 as archive", () => {
    expect(classifyFolder("@封存")).toBe("archive");
  });

  it("classifies 十週年CI as campaign", () => {
    expect(classifyFolder("十週年CI")).toBe("campaign");
  });

  it("classifies SVG as normal", () => {
    expect(classifyFolder("SVG")).toBe("normal");
  });

  it("classifies PNG as normal", () => {
    expect(classifyFolder("PNG")).toBe("normal");
  });
});

class MockDriveClient {
  private tree: Record<string, DriveFile[]>;

  constructor() {
    this.tree = this.buildTree(fixture.root, "");
  }

  private buildTree(node: any, _path: string): Record<string, DriveFile[]> {
    const result: Record<string, DriveFile[]> = {};
    if (node.children) {
      result[node.id] = node.children.map((c: any) => ({
        id: c.id,
        name: c.name,
        mimeType: c.mimeType || "image/svg+xml",
        parents: [node.id],
        modifiedTime: c.modifiedTime || "2025-01-01T00:00:00Z",
        size: c.size || 0,
      }));
      for (const child of node.children) {
        if (child.children) {
          Object.assign(result, this.buildTree(child, ""));
        }
      }
    }
    return result;
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    return this.tree[folderId] || [];
  }

  isFolder(file: DriveFile): boolean {
    return file.mimeType === "application/vnd.google-apps.folder";
  }

  isSupported(file: DriveFile): boolean {
    return ["image/svg+xml", "image/png", "application/postscript"].includes(file.mimeType);
  }
}

describe("scanDriveRoot", () => {
  it("finds all SVG and PNG files in normal folders", async () => {
    const client = new MockDriveClient() as unknown as DriveClient;
    const result = await scanDriveRoot(client, "root-folder-id");

    const normalFiles = result.files.filter((f) => f.folderSemantics === "normal");
    expect(normalFiles.length).toBe(10);
  });

  it("skips archive folders entirely (no assets, no AI spend)", async () => {
    const client = new MockDriveClient() as unknown as DriveClient;
    const result = await scanDriveRoot(client, "root-folder-id");

    // Archive folders (封存/@封存/舊版) are pruned from the walk, so their
    // files never reach the catalog at all.
    const archived = result.files.filter((f) => f.folderSemantics === "archive");
    expect(archived.length).toBe(0);
    expect(result.files.some((f) => f.name === "old-logo.svg")).toBe(false);
  });

  it("marks files in campaign folders", async () => {
    const client = new MockDriveClient() as unknown as DriveClient;
    const result = await scanDriveRoot(client, "root-folder-id");

    const campaign = result.files.filter((f) => f.folderSemantics === "campaign");
    expect(campaign.length).toBe(1);
    expect(campaign[0].name).toBe("anniversary-logo.svg");
  });

  it("records parent path for each file", async () => {
    const client = new MockDriveClient() as unknown as DriveClient;
    const result = await scanDriveRoot(client, "root-folder-id");

    const logoBlue = result.files.find((f) => f.name === "logo-blue.svg");
    expect(logoBlue?.parentPath).toBe("The News Lens 關鍵評論網/SVG");
  });
});
