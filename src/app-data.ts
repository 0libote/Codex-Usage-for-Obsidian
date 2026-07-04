import { homedir } from "node:os";
import { join, win32 } from "node:path";
import { CodexUsageError } from "./errors";

export function appDataDir(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Codex Usage");
  if (platform === "win32") {
    return win32.join(env.LOCALAPPDATA ?? env.APPDATA ?? win32.join(home, "AppData", "Local"), "Codex Usage");
  }
  throw new CodexUsageError("MANIFEST_UNAVAILABLE", `Unsupported platform: ${platform}`);
}
