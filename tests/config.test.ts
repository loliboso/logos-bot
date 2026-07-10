import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveServiceAccountKey } from "../src/config";

describe("resolveServiceAccountKey", () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) rmSync(f, { force: true });
    tmpFiles.length = 0;
  });

  it("reads the key from a file path when GOOGLE_SERVICE_ACCOUNT_KEY_PATH is set", () => {
    const path = join(tmpdir(), `sa-test-${process.pid}.json`);
    writeFileSync(path, '{"type":"service_account","x":1}');
    tmpFiles.push(path);

    const key = resolveServiceAccountKey({ GOOGLE_SERVICE_ACCOUNT_KEY_PATH: path });
    expect(JSON.parse(key).type).toBe("service_account");
  });

  it("prefers the file path over an inline key when both are set", () => {
    const path = join(tmpdir(), `sa-pref-${process.pid}.json`);
    writeFileSync(path, '{"from":"file"}');
    tmpFiles.push(path);

    const key = resolveServiceAccountKey({
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: path,
      GOOGLE_SERVICE_ACCOUNT_KEY: '{"from":"inline"}',
    });
    expect(JSON.parse(key).from).toBe("file");
  });

  it("falls back to the inline key when only GOOGLE_SERVICE_ACCOUNT_KEY is set", () => {
    const key = resolveServiceAccountKey({ GOOGLE_SERVICE_ACCOUNT_KEY: '{"from":"inline"}' });
    expect(JSON.parse(key).from).toBe("inline");
  });

  it("throws a helpful error when neither is set", () => {
    expect(() => resolveServiceAccountKey({})).toThrow(/GOOGLE_SERVICE_ACCOUNT_KEY/);
  });
});
