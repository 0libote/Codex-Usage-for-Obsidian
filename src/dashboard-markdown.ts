import type { UsageAnalytics } from "./ledger";
import type { Settings, UsageData } from "./models";

export function dashboardMarkdown(data: UsageData | null, analytics: UsageAnalytics, display: Settings["usageDisplay"]): string {
  const percent = (value: Record<string, unknown>) => {
    const used = [value.percent, value.usedPercent, value.usagePercent].find(item => typeof item === "number");
    return typeof used === "number" ? `${display === "remaining" ? 100 - used : used}% ${display}` : "Not available";
  };
  const tokens = data ? tokenUsage(data.cost) : undefined;
  const liveRows = data ? `| 5 hour usage limit | **${percent(data.usage.session)}** | ${formatReset(data.usage.session.resetsAt ?? data.usage.session.resetAt)} |
| Weekly usage limit | **${percent(data.usage.weekly)}** | ${formatReset(data.usage.weekly.resetsAt ?? data.usage.weekly.resetAt)} |
| Credits remaining | **${scalar(data.credits.remaining) || "Not available"}** | |
` : "| Live quotas | Not available on this device | Install the helper on a desktop to refresh quotas. |\n";
  const exactRows = analytics.exact ? `| Exact events | ${count(analytics.eventCount)} |
| Sessions | ${count(analytics.sessionCount)} |
| Repositories | ${count(analytics.byRepository.length)} |
| Models | ${count(analytics.byModel.length)} |
| Tracked days | ${count(analytics.trackedDays)} |
` : `| Exact events | None imported yet |
| Coverage | Waiting for a desktop import |
`;
  return `<!-- codex-usage-dashboard:v2 -->
# Codex usage

> [!info] Cross-device dashboard
> This note is generated on a desktop and can be read on any device through normal vault sync. It does not require Codex or this plugin to be installed on the reading device.

_Last generated: ${new Date(analytics.generatedAt).toLocaleString()}._

## Live limits

| Balance | Current value | Reset |
| --- | ---: | --- |
${liveRows}

## Usage overview

| Measure | Value |
| --- | ---: |
${exactRows}

| Period | Tokens | Turns | Sessions |
| --- | ---: | ---: | ---: |
| Today | ${count(analytics.windows.today.tokens.total) || "0"} | ${count(analytics.windows.today.events) || "0"} | ${count(analytics.windows.today.sessions) || "0"} |
| Last 7 days | ${count(analytics.windows.week.tokens.total) || "0"} | ${count(analytics.windows.week.events) || "0"} | ${count(analytics.windows.week.sessions) || "0"} |
| Last 30 days | ${count(analytics.windows.month.tokens.total) || "0"} | ${count(analytics.windows.month.events) || "0"} | ${count(analytics.windows.month.sessions) || "0"} |
| This year | ${count(analytics.windows.year.tokens.total) || "0"} | ${count(analytics.windows.year.events) || "0"} | ${count(analytics.windows.year.sessions) || "0"} |
| All tracked time | ${count(analytics.windows.lifetime.tokens.total) || "0"} | ${count(analytics.windows.lifetime.events) || "0"} | ${count(analytics.windows.lifetime.sessions) || "0"} |

${analytics.exact ? `**Coverage:** ${analytics.firstTrackedAt ? new Date(analytics.firstTrackedAt).toLocaleDateString() : "Unknown"} to ${analytics.lastTrackedAt ? new Date(analytics.lastTrackedAt).toLocaleDateString() : "Unknown"}. ${count(analytics.unknownRepositoryEvents)} events have no repository attribution.` : "**Coverage:** Exact local events will appear after the first desktop import."}

## By repository

${markdownBuckets(analytics.byRepository)}

## By model

${markdownBuckets(analytics.byModel)}

## By provider

${markdownBuckets(analytics.byProvider)}

## By year

${markdownBuckets(analytics.byYear)}

## Daily activity

${markdownDaily(analytics.daily)}

## Token composition

| Token type | All tracked time |
| --- | ---: |
| Input | ${count(analytics.windows.lifetime.tokens.input) || "0"} |
| Output | ${count(analytics.windows.lifetime.tokens.output) || "0"} |
| Cached input | ${count(analytics.windows.lifetime.tokens.cached) || "0"} |
| Reasoning output | ${count(analytics.windows.lifetime.tokens.reasoning) || "0"} |

${data ? `## Reported cost

- Last 30 days: ${money(data.cost.last30DaysCostUSD, data.cost.currencyCode) || "Not available"}
- Current session: ${money(data.cost.sessionCostUSD, data.cost.currencyCode) || "Not available"}
- Helper-reported tokens: ${count(tokens?.processed) || "Not available"}
- Helper-reported cache reads: ${count(tokens?.cached) || "0"}

` : ""}_The analytics ledger contains exact token events imported from local Codex session logs. Cost and quotas are helper-reported where available. Repository paths, prompts, raw logs, and credentials are not written to this note._
`;
}

function markdownBuckets(rows: UsageAnalytics["byRepository"]): string {
  if (!rows.length) return "_No exact events imported yet._";
  return `| Name | Tokens | Turns |
| --- | ---: | ---: |
${rows.slice(0, 10).map(row => `| ${escapeMarkdown(row.label)} | ${count(row.tokens.total) || "0"} | ${count(row.events) || "0"} |`).join("\n")}`;
}

function markdownDaily(rows: UsageAnalytics["daily"]): string {
  if (!rows.length) return "_No exact events imported yet._";
  return `| Date | Tokens | Turns |
| --- | ---: | ---: |
${rows.slice(-14).map(row => `| ${row.date} | ${count(row.tokens.total) || "0"} | ${count(row.events) || "0"} |`).join("\n")}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[|\\]/g, "\\$&");
}

function tokenUsage(cost: Record<string, unknown>): {
  processed: number | undefined;
  cached: number;
} {
  const totals = record(cost.totals);
  return {
    processed: number(totals.totalTokens) ?? number(cost.last30DaysTokens),
    cached: number(totals.cacheReadTokens) ?? 0
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function count(value: unknown): string {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function money(value: unknown, currency: unknown): string {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: typeof currency === "string" ? currency : "USD"
  }).format(value);
}

function formatReset(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
