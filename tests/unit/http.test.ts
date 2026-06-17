import { describe, it, expect } from "vitest";
import { assertSafeUrl } from "@/lib/http";

// IP-literal hosts skip DNS, so these assertions exercise the range logic
// without any network access.
describe("assertSafeUrl", () => {
  it("rejects non-https schemes", async () => {
    await expect(assertSafeUrl("http://example.com/a.mp3")).rejects.toThrow(
      /https/,
    );
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(/https/);
  });

  it("rejects malformed urls", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(/malformed/);
  });

  it.each([
    "https://127.0.0.1/x",
    "https://10.0.0.5/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data", // cloud metadata
    "https://100.64.0.1/x", // CGNAT
    "https://0.0.0.0/x",
    "https://[::1]/x",
    "https://[fc00::1]/x",
    "https://[fe80::1]/x",
    "https://[::ffff:127.0.0.1]/x", // IPv4-mapped loopback
  ])("rejects private/reserved target %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow(/disallowed/);
  });

  it.each([
    "https://8.8.8.8/x",
    "https://1.1.1.1/song.mp3",
    "https://[2606:4700:4700::1111]/x",
  ])("allows a public target %s", async (url) => {
    await expect(assertSafeUrl(url)).resolves.toBeInstanceOf(URL);
  });
});
