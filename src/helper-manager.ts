import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { get } from "node:https";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { adapters } from "./adapters";
import { UsageCache } from "./cache";
import { CodexUsageError } from "./errors";
import { HELPER_MANIFEST, HelperPackage } from "./helper-manifest";
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
  readonly target = detectTarget();
  readonly descriptor: HelperPackage = HELPER_MANIFEST.helpers[this.target];
  readonly installDir: string;
  readonly binaryPath: string;
  private readonly metadataPath: string;
  private readonly cache = new UsageCache();

  constructor(dataDir: string) {
    this.installDir = join(dataDir, "helpers", this.target);
    this.binaryPath = join(this.installDir, this.descriptor.binaryName);
    this.metadataPath = join(this.installDir, "installed.json");
  }

  async status(): Promise<HelperStatus> {
    let installedVersion = "";
    try {
      await stat(this.binaryPath);
      installedVersion = JSON.parse(await readFile(this.metadataPath, "utf8")).ourPackageVersion ?? "";
    } catch {
      return { state: "Missing", target: this.target, path: this.binaryPath, installedVersion, knownGoodVersion: this.descriptor.ourPackageVersion };
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
    const archive = join(this.installDir, `${this.descriptor.assetName}.download`);
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
    await rm(this.installDir, { recursive: true, force: true });
    this.cache.clear();
  }

  async usage(ttlSeconds: number, bypassCache = false): Promise<UsageData> {
    if (!bypassCache) {
      const cached = this.cache.get(ttlSeconds);
      if (cached) return cached;
    }
    try {
      const status = await this.status();
      if (status.state === "Missing") throw new CodexUsageError("HELPER_NOT_INSTALLED", "Install the managed helper first.");
      const adapter = adapters[this.descriptor.adapter];
      const { stdout } = await execute(this.binaryPath, adapter.usageArgs, { timeout: 30_000, windowsHide: true, maxBuffer: 5_000_000 });
      return this.cache.set(adapter.parse(stdout, {
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
      }));
    } catch (error) {
      const stale = this.cache.stale(`Refresh failed; showing stale data. ${message(error)}`);
      if (stale) return stale;
      if (error instanceof CodexUsageError) throw error;
      throw new CodexUsageError("COMMAND_FAILED", "The helper command failed.", message(error));
    }
  }

  async diagnostics(): Promise<string> {
    const adapter = adapters[this.descriptor.adapter];
    try {
      const { stdout, stderr } = await execute(this.binaryPath, adapter.diagnosticsArgs, { timeout: 30_000, windowsHide: true });
      return [stdout, stderr].filter(Boolean).join("\n");
    } catch (error) {
      throw new CodexUsageError("COMMAND_FAILED", "Helper diagnostics failed.", message(error));
    }
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
