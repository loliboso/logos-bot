import { describe, it, expect, vi } from "vitest";
import { DriveClient, formatForName } from "../../src/scanner/drive-client";

// A minimal service-account-shaped key so the constructor's JSON.parse + GoogleAuth
// don't throw. We never make a real network call — the drive client is stubbed.
const FAKE_KEY = JSON.stringify({
  type: "service_account",
  project_id: "p",
  private_key: "x",
  client_email: "x@x.iam.gserviceaccount.com",
});

function makeClient(listImpl: (params: any) => Promise<any>): DriveClient {
  const client = new DriveClient(FAKE_KEY);
  (client as any).drive = { files: { list: vi.fn(listImpl) } };
  return client;
}

describe("format / support by extension (Drive mislabels .svg)", () => {
  const client = new DriveClient(FAKE_KEY);
  const f = (name: string, mimeType: string) => ({ id: "1", name, mimeType, parents: [], modifiedTime: "", size: 0 });

  it("treats a .svg stored as text/xml as a supported svg", () => {
    // This is exactly what broke TNL / iCook: Drive typed their .svg as text/xml.
    expect(client.isSupported(f("logo-primary.svg", "text/xml"))).toBe(true);
    expect(formatForName("logo-primary.svg")).toBe("svg");
  });

  it("still supports correctly-typed files and rejects unsupported ones", () => {
    expect(client.isSupported(f("a.png", "image/png"))).toBe(true);
    expect(client.isSupported(f("a.ai", "application/illustrator"))).toBe(true);
    expect(client.isSupported(f("notes.txt", "text/plain"))).toBe(false);
    expect(formatForName("logo.ai")).toBe("ai");
    expect(formatForName("readme.md")).toBeNull();
  });
});

describe("DriveClient.listFolder", () => {
  it("passes shared-drive params so Shared Drive contents are returned", async () => {
    let captured: any;
    const client = makeClient(async (params) => {
      captured = params;
      return { data: { files: [], nextPageToken: undefined } };
    });

    await client.listFolder("folder-1");

    expect(captured.supportsAllDrives).toBe(true);
    expect(captured.includeItemsFromAllDrives).toBe(true);
  });

  it("maps returned files and follows pagination", async () => {
    const pages = [
      {
        data: {
          files: [
            { id: "a", name: "logo.svg", mimeType: "image/svg+xml", parents: ["folder-1"], modifiedTime: "t", size: "10" },
          ],
          nextPageToken: "next",
        },
      },
      {
        data: {
          files: [
            { id: "b", name: "mark.png", mimeType: "image/png", parents: ["folder-1"], modifiedTime: "t", size: "20" },
          ],
          nextPageToken: undefined,
        },
      },
    ];
    let call = 0;
    const client = makeClient(async () => pages[call++]);

    const files = await client.listFolder("folder-1");

    expect(files.map((f) => f.id)).toEqual(["a", "b"]);
    expect(files[0].size).toBe(10);
  });
});
