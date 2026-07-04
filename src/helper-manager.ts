import { createHash } from "node:crypto";
import { ChildProcess, execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { adapters } from "./adapters";
import { UsageCache } from "./cache";
import { CodexUsageError } from "./errors";
import { HELPER_MANIFEST, HelperPackage } from "./helper-manifest";
import { Logger } from "./logging";
import { HelperState, UsageData } from "./models";
import { detectTarget, HelperTarget } from "./platform";

const execute = promisify(execFile);

export interface HelperStatus {
  state: HelperState;
  target: HelperTarget;
  path: string;
  installedVersion: string;
  knownGoodVersion: string;
}

export class HelperManager {
  readonly target: HelperTarget;
  readonly descriptor: HelperPackage;
  readonly installDir: string;
  readonly binaryPath: string;
  private readonly metadataPath: string;
  private readonly cachePath: string;
  private readonly cache = new UsageCache();
  private readonly children = new Set<ChildProcess>();
  private cacheLoaded = false;

  constructor(dataDir: string, target = detectTarget(), private logger?: Logger) {
    this.target = target;
    this.descriptor = HELPER_MANIFEST.helpers[target];
    this.installDir = join(dataDir, "helpers", this.target);
    this.binaryPath = join(this.installDir, this.descriptor.binaryName);
    this.metadataPath = join(this.installDir, "installed.json");
    this.cachePath = join(dataDir, "cache", "usage.json");
  }

  async status(): Promise<HelperStatus> {
    let installedVersion = "";
    try {
      await stat(this.binaryPath);
    } catch {
      return { state: "Missing", target: this.target, path: this.binaryPath, installedVersion, knownGoodVersion: this.descriptor.ourPackageVersion };
    }
    try {
      installedVersion = JSON.parse(await readFile(this.metadataPath, "utf8")).ourPackageVersion ?? "";
    } catch {
      return { state: "Broken", target: this.target, path: this.binaryPath, installedVersion, knownGoodVersion: this.descriptor.ourPackageVersion };
    }
    return {
      state: installedVersion === this.descriptor.ourPackageVersion ? "Installed" : "Update available",
      target: this.target,
      path: this.binaryPath,
      installedVersion,
      knownGoodVersion: this.descriptor.ourPackageVersion
    };
  }

  async install(): Promise<void> {
    if (!/^[a-f0-9]{64}$/i.test(this.descriptor.sha256)) {
      throw new CodexUsageError("MANIFEST_UNAVAILABLE", "This helper release has not been configured with a valid checksum.");
    }
    await mkdir(this.installDir, { recursive: true });
    const archive = join(this.installDir, `download-${this.descriptor.assetName}`);
    const staging = join(this.installDir, "staging");
    try {
      await download(this.descriptor.downloadUrl, archive);
      await verifySha256(archive, this.descriptor.sha256);
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging);
      await extract(archive, staging);
      const stagedBinary = join(staging, this.descriptor.binaryName);
      await stat(stagedBinary);
      const nextBinary = `${this.binaryPath}.new`;
      await copyFile(stagedBinary, nextBinary);
      if (process.platform !== "win32") await chmod(nextBinary, 0o755);
      await rename(nextBinary, this.binaryPath);
      await writeFile(this.metadataPath, JSON.stringify(this.descriptor, null, 2));
    } catch (error) {
      if (error instanceof CodexUsageError) throw error;
      throw new CodexUsageError("DOWNLOAD_FAILED", "Helper installation failed.", String(error));
    } finally {
      await rm(archive, { force: true });
      await rm(staging, { recursive: true, force: true });
    }
  }

  async remove(): Promise<void> {
    this.stop();
    await rm(this.installDir, { recursive: true, force: true });
    await this.clearCache();
  }

  async usage(ttlSeconds: number, bypassCache = false): Promise<UsageData> {
    await this.loadCache();
    if (!bypassCache) {
      const cached = this.cache.get(ttlSeconds);
      if (cached) return cached;
    }
    try {
      const status = await this.status();
      if (status.state === "Missing") throw new CodexUsageError("HELPER_NOT_INSTALLED", "Install the managed helper first.");
      const adapter = adapters[this.descriptor.adapter];
      await this.logger?.write("debug", "Refreshing usage.");
      const { stdout } = await this.run(adapter.usageArgs);
      let data = adapter.parse(stdout, {
        provider: "codex",
        platform: this.target.startsWith("macos") ? "macos" : "windows",
        architecture: this.target.endsWith("arm64") ? "arm64" : "x64",
        adapter: adapter.id,
        timestamp: new Date().toISOString(),
        cacheAgeSeconds: 0,
        helper: {
          installed: true,
          path: this.binaryPath,
          version: status.installedVersion,
          upstreamVersion: this.descriptor.upstreamVersion,
          ourPackageVersion: this.descriptor.ourPackageVersion
        }
      });
      if (adapter.costArgs) {
        try {
          const result = adapter.parseCost((await this.run(adapter.costArgs)).stdout);
          data = { ...data, cost: result.cost, raw: { usage: data.raw, cost: result.raw } };
        } catch (error) {
          const warning = "Cost refresh failed. Run diagnostics for details.";
          data.warnings.push(warning);
          await this.logger?.write("warn", warning);
        }
      }
      const cached = this.cache.set(data);
      await this.persistCache(cached);
      await this.logger?.write("info", "Usage refresh completed.");
      return cached;
    } catch (error) {
      const stale = this.cache.stale(`Refresh failed; showing stale data. ${message(error)}`);
      await this.logger?.write("error", "Usage refresh failed.");
      if (stale) return stale;
      if (error instanceof CodexUsageError) throw error;
      throw new CodexUsageError("COMMAND_FAILED", "The helper command failed.", message(error));
    }
  }

  async diagnostics(): Promise<string> {
    const adapter = adapters[this.descriptor.adapter];
    try {
      const { stdout, stderr } = await this.run(adapter.diagnosticsArgs);
      return [stdout, stderr].filter(Boolean).join("\n");
    } catch (error) {
      throw new CodexUsageError("COMMAND_FAILED", "Helper diagnostics failed.", message(error));
    }
  }

  async cached(): Promise<UsageData | undefined> {
    await this.loadCache();
    return this.cache.stale("Showing the last successful data while the helper starts.");
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.cacheLoaded = true;
    await rm(this.cachePath, { force: true });
    await this.logger?.write("info", "Cache cleared.");
  }

  stop(): void {
    for (const child of this.children) child.kill();
    this.children.clear();
  }

  private run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = execFile(this.binaryPath, args, {
        timeout: 30_000,
        windowsHide: true,
        maxBuffer: 5_000_000
      }, (error, stdout, stderr) => {
        this.children.delete(child);
        error ? reject(error) : resolve({ stdout, stderr });
      });
      this.children.add(child);
    });
  }

  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    try {
      const stored = JSON.parse(await readFile(this.cachePath, "utf8")) as { savedAt: number; value: UsageData };
      this.cache.restore(stored.value, stored.savedAt);
      await this.logger?.write("debug", "Loaded persisted usage cache.");
    } catch {
      // No prior successful data.
    }
  }

  private async persistCache(value: UsageData): Promise<void> {
    await mkdir(dirname(this.cachePath), { recursive: true });
    await writeFile(this.cachePath, JSON.stringify({ savedAt: Date.now(), value }));
  }
}

export async function verifySha256(path: string, expected: string): Promise<void> {
  const actual = createHash("sha256").update(await readFile(path)).digest("hex");
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new CodexUsageError("CHECKSUM_FAILED", "Helper checksum verification failed.", `Expected ${expected}; received ${actual}`);
  }
}

async function download(url: string, destination: string, redirects = 0): Promise<void> {
  if (redirects > 5) throw new CodexUsageError("DOWNLOAD_FAILED", "Too many download redirects.");
  await mkdir(dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const request = get(url, response => {
      if (response.statusCode && [301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url).toString(), destination, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new CodexUsageError("DOWNLOAD_FAILED", `Helper download returned HTTP ${response.statusCode}.`));
        return;
      }
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.from(chunk)));
      response.on("end", () => writeFile(destination, Buffer.concat(chunks)).then(() => resolve(), reject));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => request.destroy(new Error("Download timed out")));
  });
}

async function extract(archive: string, destination: string): Promise<void> {
  if (process.platform === "win32") {
    await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force", archive, destination]);
  } else {
    await execute("tar", ["-xzf", archive, "-C", destination]);
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
