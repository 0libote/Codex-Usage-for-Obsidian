import { CodexUsageError } from "./errors";

export type HelperTarget = "macos-arm64" | "macos-x64" | "windows-x64";

export function detectTarget(platform = process.platform, arch = process.arch): HelperTarget {
  if (platform === "darwin" && arch === "arm64") return "macos-arm64";
  if (platform === "darwin" && arch === "x64") return "macos-x64";
  if (platform === "win32" && arch === "x64") return "windows-x64";
  throw new CodexUsageError("MANIFEST_UNAVAILABLE", `Unsupported platform: ${platform}-${arch}`);
}
