import { describe, it, expect, vi } from "vitest";
import { DriveClient } from "../../src/scanner/drive-client";

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
