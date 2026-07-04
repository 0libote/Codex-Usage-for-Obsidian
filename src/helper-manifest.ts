import manifestJson from "../helpers/manifest.json";
import { CodexUsageError } from "./errors";
import { HelperTarget } from "./platform";

export interface HelperPackage {
  sourceProject: string;
  upstreamVersion: string;
  ourPackageVersion: string;
  assetName: string;
  downloadUrl: string;
  sha256: string;
  binaryName: string;
  adapter: "codexbar_macos" | "wincodexbar_windows";
  minPluginVersion: string;
  notes: string;
}

export interface HelperManifest {
  version: number;
  helpers: Record<HelperTarget, HelperPackage>;
}

export function parseManifest(input: unknown): HelperManifest {
  const value = input as Partial<HelperManifest>;
  if (value.version !== 1 || !value.helpers) {
    throw new CodexUsageError("MANIFEST_UNAVAILABLE", "Unsupported or invalid helper manifest.");
  }
  for (const target of ["macos-arm64", "macos-x64", "windows-x64"] as const) {
    const item = value.helpers[target];
    if (!item?.downloadUrl || !item.sha256 || !item.binaryName || !item.adapter) {
      throw new CodexUsageError("MANIFEST_UNAVAILABLE", `Missing helper manifest fields for ${target}.`);
    }
  }
  return value as HelperManifest;
}

export const HELPER_MANIFEST = parseManifest(manifestJson);
