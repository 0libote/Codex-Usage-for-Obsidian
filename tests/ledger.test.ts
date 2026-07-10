import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UsageLedger, parseCodexSession } from "../src/ledger";

const session = (sessionId: string, timestamp: string): string => [
  JSON.stringify({
    timestamp,
    type: "session_meta",
    session_id: sessionId,
    cwd: "/Users/test/Documents/GitHub/demo-repo",
    model_provider: "openai",
    git: { repository_url: "https://github.com/example/demo-repo.git" }
  }),
  JSON.stringify({
    timestamp,
    type: "turn_context",
    payload: { type: "turn_context", turn_id: `${sessionId}-turn`, cwd: "/Users/test/Documents/GitHub/demo-repo", model: "gpt-5.4" }
  }),
  JSON.stringify({
    timestamp,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { last_token_usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 30, reasoning_output_tokens: 6, total_tokens: 150 } }
    }
  })
].join("\n");

describe("local usage ledger", () => {
  it("extracts exact model, repository, session, and token data", async () => {
    const events = await parseCodexSession(session("session-1", "2026-07-11T10:00:00.000Z"), "/tmp/session.jsonl");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sessionId: "session-1",
      model: "gpt-5.4",
      repository: { name: "demo-repo", remote: "https://github.com/example/demo-repo.git" },
      tokens: { input: 120, output: 30, cached: 40, reasoning: 6, total: 150 },
      confidence: "exact"
    });
    expect(events[0]?.repository?.path).toBeUndefined();
    const withPaths = await parseCodexSession(session("session-1", "2026-07-11T10:00:00.000Z"), "/tmp/session.jsonl", true);
    expect(withPaths[0]?.repository?.path).toBe("/Users/test/Documents/GitHub/demo-repo");
  });

  it("imports changed session files idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "codex-ledger-"));
    const codexHome = join(root, ".codex");
    const sessionDir = join(codexHome, "sessions", "2026", "07", "11");
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, "session.jsonl"), session("session-1", "2026-07-11T10:00:00.000Z"));
    const ledger = new UsageLedger(root);
    await ledger.importLocalCodexSessions(false, codexHome);
    await ledger.importLocalCodexSessions(false, codexHome);
    const analytics = await ledger.analytics();
    expect(analytics.eventCount).toBe(1);
    expect(analytics.windows.lifetime.tokens.total).toBe(150);
    expect(analytics.byModel[0]?.label).toBe("gpt-5.4");
    expect(analytics.byRepository[0]?.label).toBe("demo-repo");
  });
});
