export type Capability =
  | "usage" | "cost" | "credits" | "sessionQuota" | "weeklyQuota"
  | "resetWindows" | "accountInfo" | "providerStatus" | "rawOutput" | "diagnostics";

export type HelperState = "Missing" | "Installed" | "Update available" | "Running" | "Broken";

export interface UsageData {
  provider: string;
  platform: "macos" | "windows";
  architecture: "arm64" | "x64";
  adapter: "codexbar_macos" | "wincodexbar_windows" | "mock";
  timestamp: string;
  cacheAgeSeconds: number;
  helper: {
    installed: boolean;
    path: string;
    version: string;
    upstreamVersion: string;
    ourPackageVersion: string;
  };
  usage: {
    session: Record<string, unknown>;
    weekly: Record<string, unknown>;
    monthly: Record<string, unknown> | null;
  };
  credits: Record<string, unknown>;
  cost: Record<string, unknown>;
  pace: Record<string, unknown>;
  status: Record<string, unknown>;
  account: Record<string, unknown>;
  capabilities: Capability[];
  warnings: string[];
  raw: unknown;
}

export interface Settings {
  cacheTtlSeconds: number;
  refreshIntervalMinutes: number;
  logLevel: "error" | "warn" | "info" | "debug";
  usageDisplay: "remaining" | "used";
}

export const DEFAULT_SETTINGS: Settings = {
  cacheTtlSeconds: 60,
  refreshIntervalMinutes: 1,
  logLevel: "info",
  usageDisplay: "remaining"
};
