import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";
import { runFullScan } from "../../src/scanner/run-scan";
import { DriveClient, DriveFile } from "../../src/scanner/drive-client";
import { AiProvider } from "../../src/ai/provider";
import { AiBuilder } from "../../src/catalog/ai-builder";
import { CatalogRepo } from "../../src/catalog/catalog-repo";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "../../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Mock Drive with a single normal folder of SVG files, driven by a mutable
 * file list so tests can change modifiedTime / add / remove files between
 * scans. downloadFile returns a tiny valid SVG so dimension extraction works.
 */
class MockDrive {
  files: DriveFile[];

  constructor(files: DriveFile[]) {
    this.files = files;
  }

  async listFolder(folderId: string): Promise<DriveFile[]> {
    if (folderId === "root") {
      return [
        {
          id: "brand-folder",
          name: "The News Lens 關鍵評論網",
          mimeType: FOLDER_MIME,
          parents: ["root"],
          modifiedTime: "2025-01-01T00:00:00Z",
          size: 0,
        },
      ];
    }
    if (folderId === "brand-folder") return this.files;
    return [];
  }

  async downloadFile(_fileId: string): Promise<Buffer> {
    return Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100" viewBox="0 0 300 100"></svg>'
    );
  }

  isFolder(file: DriveFile): boolean {
    return file.mimeType === FOLDER_MIME;
  }

  isSupported(file: DriveFile): boolean {
    return ["image/svg+xml", "image/png"].includes(file.mimeType);
  }
}

const svgFile = (id: string, name: string, modifiedTime: string): DriveFile => ({
  id,
  name,
  mimeType: "image/svg+xml",
  parents: ["brand-folder"],
  modifiedTime,
  size: 100,
});

const pngFile = (id: string, name: string, modifiedTime: string): DriveFile => ({
  id,
  name,
  mimeType: "image/png",
  parents: ["brand-folder"],
  modifiedTime,
  size: 100,
});

// Counts generateStructured calls so tests can assert how many files hit AI.
function countingProvider(): { provider: AiProvider; calls: () => number } {
  let calls = 0;
  const provider: AiProvider = {
    generateStructured: async () => {
      calls++;
      return {
        asset_type: "logo",
        variant: "logo",
        language: null,
        color: "blue",
        background: "transparent",
        layout: "horizontal",
        usage: ["general"],
        confidence: 0.95,
        inferred_from: ["file_name"],
        review_status: "accepted",
        review_reason: null,
      };
    },
  };
  return { provider, calls: () => calls };
}

// A provider whose AI call always fails, to exercise per-file resilience.
const throwingProvider: AiProvider = {
  generateStructured: async () => {
    throw new Error("simulated AI failure");
  },
};

function scanOptions(drive: MockDrive, provider: AiProvider, db: Database.Database, full = false) {
  return {
    driveClient: drive as unknown as DriveClient,
    rootFolderId: "root",
    db,
    // Wrap the counting provider in an AiBuilder so these incremental tests keep
    // asserting AI-call counts; the incremental logic under test is builder-agnostic.
    builder: new AiBuilder(provider),
    outputDir,
    full,
  };
}

// review-export / coverage-report write files here; a real temp dir keeps the
// scan end-to-end without stubbing the report writers.
let outputDir: string;

describe("runFullScan incremental", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    outputDir = join(process.env.TMPDIR || "/tmp", `logos-scan-test-${Math.random().toString(36).slice(2)}`);
    require("fs").mkdirSync(outputDir, { recursive: true });
  });

  it("first scan processes every file and calls AI once per file", async () => {
    const drive = new MockDrive([
      svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
      svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
    ]);
    const { provider, calls } = countingProvider();

    const summary = await runFullScan(scanOptions(drive, provider, db));

    expect(summary.totalFiles).toBe(2);
    expect(summary.processed).toBe(2);
    expect(summary.unchanged).toBe(0);
    expect(calls()).toBe(2);
    expect(new CatalogRepo(db).findAssets({}).length).toBe(2);
  });

  it("second scan with no changes calls AI zero times", async () => {
    const files = [
      svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
      svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
    ];
    const first = countingProvider();
    await runFullScan(scanOptions(new MockDrive([...files]), first.provider, db));

    const second = countingProvider();
    const summary = await runFullScan(scanOptions(new MockDrive([...files]), second.provider, db));

    expect(second.calls()).toBe(0);
    expect(summary.processed).toBe(0);
    expect(summary.unchanged).toBe(2);
    expect(summary.removed).toBe(0);
  });

  it("only re-processes a file whose modifiedTime changed", async () => {
    const first = countingProvider();
    await runFullScan(
      scanOptions(
        new MockDrive([
          svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
          svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
        ]),
        first.provider,
        db
      )
    );

    const second = countingProvider();
    const summary = await runFullScan(
      scanOptions(
        new MockDrive([
          svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
          svgFile("f2", "logo-en-blue.svg", "2025-06-01T00:00:00Z"), // changed
        ]),
        second.provider,
        db
      )
    );

    expect(second.calls()).toBe(1);
    expect(summary.processed).toBe(1);
    expect(summary.unchanged).toBe(1);
  });

  it("marks an asset removed when its Drive source disappears", async () => {
    const first = countingProvider();
    await runFullScan(
      scanOptions(
        new MockDrive([
          svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
          svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
        ]),
        first.provider,
        db
      )
    );

    const second = countingProvider();
    const summary = await runFullScan(
      scanOptions(
        new MockDrive([svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z")]), // f2 gone
        second.provider,
        db
      )
    );

    expect(summary.removed).toBe(1);
    expect(summary.unchanged).toBe(1);

    // The removed asset is excluded from active queries; the survivor remains.
    const active = new CatalogRepo(db).findAssets({});
    expect(active.length).toBe(1);
    const all = db.prepare("SELECT status FROM assets WHERE source_drive_file_id = 'f2'").get() as any;
    expect(all.status).toBe("removed");
  });

  it("--full re-processes every file even when unchanged", async () => {
    const files = [
      svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
      svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
    ];
    const first = countingProvider();
    await runFullScan(scanOptions(new MockDrive([...files]), first.provider, db));

    const second = countingProvider();
    const summary = await runFullScan(scanOptions(new MockDrive([...files]), second.provider, db, true));

    expect(second.calls()).toBe(2);
    expect(summary.processed).toBe(2);
    expect(summary.unchanged).toBe(0);
  });

  it("keeps an SVG and a PNG of the same logo as distinct assets (no id collision)", async () => {
    const drive = new MockDrive([
      svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
      pngFile("f2", "logo-blue.png", "2025-03-01T00:00:00Z"), // same base name, different format
    ]);
    const summary = await runFullScan(scanOptions(drive, countingProvider().provider, db));

    expect(summary.processed).toBe(2);
    const assets = new CatalogRepo(db).findAssets({});
    expect(assets.length).toBe(2); // would be 1 before the format-in-id fix
    const ids = assets.map((a) => a.id).sort();
    expect(ids.some((id) => id.endsWith("-svg"))).toBe(true);
    expect(ids.some((id) => id.endsWith("-png"))).toBe(true);
    expect(new Set(assets.map((a) => a.format))).toEqual(new Set(["svg", "png"]));
  });

  it("retires the old asset when a file's id changes (rename) instead of orphaning it", async () => {
    await runFullScan(
      scanOptions(new MockDrive([svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z")]), countingProvider().provider, db)
    );
    // Same Drive file id, renamed (new base name) + new modifiedTime so it re-processes.
    const summary = await runFullScan(
      scanOptions(new MockDrive([svgFile("f1", "logo-primary.svg", "2025-06-01T00:00:00Z")]), countingProvider().provider, db)
    );

    expect(summary.processed).toBe(1);
    expect(summary.removed).toBe(1); // the old id is retired, not left as a duplicate
    const active = new CatalogRepo(db).findAssets({});
    expect(active.length).toBe(1);
    expect(active[0].id).toContain("logo-primary");
  });

  it("a failing AI call skips the file without aborting the whole scan", async () => {
    const drive = new MockDrive([
      svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z"),
      svgFile("f2", "logo-en-blue.svg", "2025-03-01T00:00:00Z"),
    ]);
    // Should resolve (not throw), and record both as failed.
    const summary = await runFullScan(scanOptions(drive, throwingProvider, db));
    expect(summary.failed).toBe(2);
    expect(summary.processed).toBe(0);
    expect(new CatalogRepo(db).findAssets({}).length).toBe(0);
  });

  it("keeps an existing asset when its re-scan fails (no retirement over a transient error)", async () => {
    // Scan 1 succeeds → asset active.
    await runFullScan(
      scanOptions(new MockDrive([svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z")]), countingProvider().provider, db)
    );
    expect(new CatalogRepo(db).findAssets({}).length).toBe(1);

    // Scan 2: same file, changed modifiedTime (so it re-processes), but AI fails.
    const summary = await runFullScan(
      scanOptions(new MockDrive([svgFile("f1", "logo-blue.svg", "2025-09-01T00:00:00Z")]), throwingProvider, db)
    );
    expect(summary.failed).toBe(1);
    expect(summary.removed).toBe(0); // existing asset must NOT be retired
    expect(new CatalogRepo(db).findAssets({}).length).toBe(1);
  });

  it("revives a removed asset that reappears with the same modifiedTime", async () => {
    const file = svgFile("f1", "logo-blue.svg", "2025-03-01T00:00:00Z");

    // Scan 1: present. Scan 2: gone (marked removed). Scan 3: back again.
    await runFullScan(scanOptions(new MockDrive([{ ...file }]), countingProvider().provider, db));
    await runFullScan(scanOptions(new MockDrive([]), countingProvider().provider, db));

    const third = countingProvider();
    const summary = await runFullScan(scanOptions(new MockDrive([{ ...file }]), third.provider, db));

    // Even though modifiedTime matches the original, the prior row was 'removed',
    // so it must be re-processed and revived to 'active'.
    expect(third.calls()).toBe(1);
    expect(summary.processed).toBe(1);
    expect(new CatalogRepo(db).findAssets({}).length).toBe(1);
  });
});
