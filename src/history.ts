import type { UsageData } from "./models";

export type MetricKey =
  | "sessionPercent" | "weeklyPercent" | "monthlyPercent" | "credits" | "cost30Days" | "sessionCost"
  | "tokens" | "inputTokens" | "outputTokens" | "cachedTokens" | "cacheRate";

export interface HistorySample {
  timestamp: string;
  values: Partial<Record<MetricKey, number>>;
}

export function historySample(data: UsageData): HistorySample {
  const totals = record(data.cost.totals);
  const tokens = finite(totals.totalTokens) ?? finite(data.cost.last30DaysTokens);
  const cached = finite(totals.cacheReadTokens) ?? 0;
  return {
    timestamp: data.timestamp,
    values: compact({
      sessionPercent: quotaPercent(data.usage.session),
      weeklyPercent: quotaPercent(data.usage.weekly),
      monthlyPercent: data.usage.monthly ? quotaPercent(data.usage.monthly) : undefined,
      credits: finite(data.credits.remaining),
      cost30Days: finite(data.cost.last30DaysCostUSD),
      sessionCost: finite(data.cost.sessionCostUSD),
      tokens,
      inputTokens: finite(totals.inputTokens) ?? finite(data.cost.inputTokens),
      outputTokens: finite(totals.outputTokens) ?? finite(data.cost.outputTokens),
      cachedTokens: cached,
      cacheRate: tokens ? cached / tokens * 100 : undefined
    })
  };
}

export function parseHistory(value: unknown): HistorySample[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const sample = record(item);
    const values = record(sample.values);
    if (typeof sample.timestamp !== "string") return [];
    return [{
      timestamp: sample.timestamp,
      values: compact(Object.fromEntries(
        Object.entries(values).filter((entry): entry is [MetricKey, number] => finite(entry[1]) !== undefined)
      ))
    }];
  });
}

function quotaPercent(value: Record<string, unknown>): number | undefined {
  return finite(value.percent) ?? finite(value.usedPercent) ?? finite(value.usagePercent);
}

function compact(values: Partial<Record<MetricKey, number | undefined>>): Partial<Record<MetricKey, number>> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [MetricKey, number] => entry[1] !== undefined));
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
