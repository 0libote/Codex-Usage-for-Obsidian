import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adapters } from "../src/adapters";
import { UsageCache } from "../src/cache";
import { CodexUsageError } from "../src/errors";
import { parseManifest } from "../src/helper-manifest";
import { detectTarget } from "../src/platform";
import { HelperManager, verifySha256 } from "../src/helper-manager";

describe("helper core", () => {
  it("detects supported targets", () => {
    expect(detectTarget("darwin", "arm64")).toBe("macos-arm64");
    expect(detectTarget("darwin", "x64")).toBe("macos-x64");
    expect(detectTarget("win32", "x64")).toBe("windows-x64");
    expect(() => detectTarget("linux", "x64")).toThrow(CodexUsageError);
  });

  it("rejects incomplete manifests", () => {
    expect(() => parseManifest({ version: 1, helpers: {} })).toThrow("Missing helper manifest fields");
  });

  it("verifies SHA-256", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-usage-"));
    const path = join(dir, "helper");
    await writeFile(path, "known");
    await expect(verifySha256(path, createHash("sha256").update("known").digest("hex"))).resolves.toBeUndefined();
    await expect(verifySha256(path, "0".repeat(64))).rejects.toMatchObject({ code: "CHECKSUM_FAILED" });
  });

  it("reports missing, broken, and update-available helper states", async () => {
    const dir = await mkdtemp(join(tmpdir(), "codex-usage-state-"));
    const manager = new HelperManager(dir);
    expect((await manager.status()).state).toBe("Missing");
    await mkdir(manager.installDir, { recursive: true });
    await writeFile(manager.binaryPath, "");
    expect((await manager.status()).state).toBe("Broken");
    await writeFile(join(manager.installDir, "installed.json"), JSON.stringify({ ourPackageVersion: "older" }));
    expect((await manager.status()).state).toBe("Update available");
  });

  it("preserves raw output while normalising usage", () => {
    const data = adapters.mock.parse(JSON.stringify({
      usage: { session: { percent: 42 }, weekly: { percent: 8 } },
      providerSpecific: { untouched: true }
    }), {
      provider: "codex", platform: "macos", architecture: "arm64", adapter: "mock",
      timestamp: "2026-07-04T00:00:00.000Z", cacheAgeSeconds: 0,
      helper: { installed: true, path: "/tmp/mock", version: "1", upstreamVersion: "1", ourPackageVersion: "1" }
    });
    expect(data.usage.session).toEqual({ percent: 42 });
    expect(data.raw).toMatchObject({ providerSpecific: { untouched: true } });
    expect(data.capabilities).toContain("rawOutput");
  });

  it("normalises current array output without discarding sibling payloads", () => {
    const raw = [
      { provider: "codex", usage: { primary: { usedPercent: 7 }, secondary: { usedPercent: 9 } } },
      { provider: "other", providerSpecific: true }
    ];
    const data = adapters.mock.parse(JSON.stringify(raw), {
      provider: "codex", platform: "macos", architecture: "arm64", adapter: "mock",
      timestamp: "", cacheAgeSeconds: 0,
      helper: { installed: true, path: "", version: "", upstreamVersion: "", ourPackageVersion: "" }
    });
    expect(data.usage.session).toEqual({ usedPercent: 7 });
    expect(data.raw).toEqual(raw);
  });

  it("constructs verified upstream command lines in one place", () => {
    expect(adapters.codexbar_macos.usageArgs).toEqual([
      "usage", "--provider", "codex", "--format", "json", "--json-only"
    ]);
    expect(adapters.codexbar_macos.diagnosticsArgs[0]).toBe("diagnose");
    expect(adapters.wincodexbar_windows.usageArgs).toContain("codex");
  });

  it.each([
    ["macos", "codexbar_macos"],
    ["windows", "wincodexbar_windows"]
  ] as const)("parses the %s fixture", async (platform, adapterId) => {
    const raw = await readFile(join(process.cwd(), "fixtures", platform, "usage.sample.json"), "utf8");
    const data = adapters[adapterId].parse(raw, {
      provider: "codex", platform: platform === "macos" ? "macos" : "windows",
      architecture: "x64", adapter: adapterId, timestamp: "", cacheAgeSeconds: 0,
      helper: { installed: true, path: "", version: "", upstreamVersion: "", ourPackageVersion: "" }
    });
    expect(Object.keys(data.usage.session).length).toBeGreaterThan(0);
    expect(data.raw).toHaveProperty(platform === "macos" ? "macosExtra" : "windowsExtra");
  });

  it("returns stale cache with a warning", () => {
    const cache = new UsageCache();
    const value = adapters.mock.parse("{}", {
      provider: "codex", platform: "windows", architecture: "x64", adapter: "mock",
      timestamp: "", cacheAgeSeconds: 0,
      helper: { installed: true, path: "", version: "", upstreamVersion: "", ourPackageVersion: "" }
    });
    cache.set(value);
    expect(cache.stale("failed")?.warnings).toContain("failed");
    cache.clear();
    expect(cache.stale("failed")).toBeUndefined();
  });
});
