import { CodexUsageError } from "./errors";
import { Capability, UsageData } from "./models";

export interface Adapter {
  id: UsageData["adapter"];
  capabilities: Capability[];
  versionArgs: string[];
  usageArgs: string[];
  costArgs?: string[];
  diagnosticsArgs: string[];
  parse(raw: string, context: Omit<UsageData, "usage" | "credits" | "cost" | "pace" | "status" | "account" | "capabilities" | "warnings" | "raw">): UsageData;
}

function parseJson(raw: string): { payload: Record<string, unknown>; raw: unknown } {
  try {
    const parsed: unknown = JSON.parse(raw);
    const payload = Array.isArray(parsed)
      ? parsed.find(item => record(item).provider === "codex") ?? parsed[0]
      : parsed;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Expected a JSON object or non-empty array");
    return { payload: payload as Record<string, unknown>, raw: parsed };
  } catch (error) {
    throw new CodexUsageError("PARSE_FAILED", "The helper returned invalid JSON.", String(error));
  }
}

function normalise(adapter: Adapter, rawText: string, context: Parameters<Adapter["parse"]>[1]): UsageData {
  const parsed = parseJson(rawText);
  const payload = parsed.payload;
  const object = (key: string) =>
    payload[key] && typeof payload[key] === "object" && !Array.isArray(payload[key])
      ? payload[key] as Record<string, unknown> : {};
  const usage = object("usage");
  const nested = Object.keys(usage).length ? usage : payload;
  return {
    ...context,
    usage: {
      session: record(nested.session ?? nested.primary),
      weekly: record(nested.weekly ?? nested.secondary),
      monthly: nullableRecord(nested.monthly ?? nested.tertiary)
    },
    credits: object("credits"),
    cost: object("cost"),
    pace: object("pace"),
    status: object("status"),
    account: object("account"),
    capabilities: adapter.capabilities,
    warnings: [],
    raw: parsed.raw
  };
}

const baseCapabilities: Capability[] = [
  "usage", "sessionQuota", "weeklyQuota", "resetWindows",
  "accountInfo", "providerStatus", "rawOutput", "diagnostics"
];

export const adapters: Record<UsageData["adapter"], Adapter> = {
  codexbar_macos: {
    id: "codexbar_macos",
    capabilities: [...baseCapabilities, "cost", "credits"],
    versionArgs: ["--version"],
    usageArgs: ["usage", "--provider", "codex", "--format", "json", "--json-only"],
    costArgs: ["cost", "--provider", "codex", "--format", "json"],
    diagnosticsArgs: ["diagnose", "--provider", "codex", "--format", "json", "--redact"],
    parse(raw, context) { return normalise(this, raw, context); }
  },
  wincodexbar_windows: {
    id: "wincodexbar_windows",
    capabilities: [...baseCapabilities, "cost", "credits"],
    versionArgs: ["--version"],
    usageArgs: ["usage", "--provider", "codex", "--format", "json"],
    costArgs: ["cost", "--provider", "codex", "--format", "json"],
    diagnosticsArgs: ["diagnose", "--provider", "codex", "--format", "json"],
    parse(raw, context) { return normalise(this, raw, context); }
  },
  mock: {
    id: "mock",
    capabilities: baseCapabilities,
    versionArgs: [],
    usageArgs: [],
    diagnosticsArgs: [],
    parse(raw, context) { return normalise(this, raw, context); }
  }
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nullableRecord(value: unknown): Record<string, unknown> | null {
  const result = record(value);
  return Object.keys(result).length ? result : null;
}
