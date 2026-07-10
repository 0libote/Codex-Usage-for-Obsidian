import { describe, expect, it } from "vitest";
import { dashboardMarkdown } from "../src/dashboard-markdown";
import { emptyAnalytics } from "../src/ledger";

describe("cross-device dashboard report", () => {
  it("renders a useful report without a local helper snapshot", () => {
    const analytics = emptyAnalytics("2026-07-11T12:00:00.000Z");
    analytics.exact = true;
    analytics.eventCount = 1;
    analytics.sessionCount = 1;
    analytics.trackedDays = 1;
    analytics.byRepository = [{
      key: "demo-repo", label: "demo-repo", events: 1, sessions: 1,
      tokens: { input: 100, output: 20, cached: 80, reasoning: 4, total: 120 }
    }];
    analytics.byModel = [{ ...analytics.byRepository[0]!, key: "gpt-5.4", label: "gpt-5.4" }];
    analytics.byProvider = [{ ...analytics.byRepository[0]!, key: "openai", label: "openai" }];
    analytics.byYear = [{ ...analytics.byRepository[0]!, key: "2026", label: "2026" }];
    analytics.windows.lifetime = { tokens: analytics.byRepository[0]!.tokens, events: 1, sessions: 1, repositories: 1, models: 1 };
    const report = dashboardMarkdown(null, analytics, "remaining");
    expect(report).toContain("Cross-device dashboard");
    expect(report).toContain("demo-repo");
    expect(report).toContain("gpt-5.4");
    expect(report).toContain("Live quotas | Not available on this device");
    expect(report).toContain("Repository paths, prompts, raw logs, and credentials are not written to this note.");
  });
});
