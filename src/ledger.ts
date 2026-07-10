import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

export interface UsageEvent {
  schemaVersion: 1;
  id: string;
  timestamp: string;
  sessionId: string;
  turnId?: string;
  provider: string;
  model?: string;
  repository?: {
    name?: string;
    remote?: string;
    path?: string;
  };
  tokens: {
    input?: number;
    output?: number;
    cached?: number;
    reasoning?: number;
    total?: number;
  };
  source: "codex-session";
  confidence: "exact";
}

export interface UsageBucket {
  key: string;
  label: string;
  events: number;
  sessions: number;
  tokens: TokenTotals;
}

export interface TokenTotals {
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  total: number;
}

export interface UsageWindow {
  tokens: TokenTotals;
  events: number;
  sessions: number;
  repositories: number;
  models: number;
}

export interface DailyUsage {
  date: string;
  tokens: TokenTotals;
  events: number;
}

export interface UsageAnalytics {
  generatedAt: string;
  firstTrackedAt?: string;
  lastTrackedAt?: string;
  eventCount: number;
  sessionCount: number;
  trackedDays: number;
  unknownRepositoryEvents: number;
  exact: boolean;
  windows: {
    today: UsageWindow;
    week: UsageWindow;
    month: UsageWindow;
    year: UsageWindow;
    lifetime: UsageWindow;
  };
  byRepository: UsageBucket[];
  byModel: UsageBucket[];
  byProvider: UsageBucket[];
  byYear: UsageBucket[];
  daily: DailyUsage[];
}

export interface ImportResult {
  filesScanned: number;
  filesImported: number;
  eventsImported: number;
  firstTrackedAt?: string;
  lastTrackedAt?: string;
}

interface ImportState {
  files: Record<string, { mtimeMs: number; size: number }>;
  includePaths?: boolean;
  sourceRoot?: string;
}

interface SessionContext {
  sessionId: string;
  timestamp?: string;
  cwd?: string;
  repository?: { name?: string; remote?: string; path?: string };
  provider: string;
  model?: string;
  turnId?: string;
}

const emptyTotals = (): TokenTotals => ({ input: 0, output: 0, cached: 0, reasoning: 0, total: 0 });

export class UsageLedger {
  private readonly eventsPath: string;
  private readonly statePath: string;
  private events = new Map<string, UsageEvent>();
  private loaded = false;

  constructor(private readonly dataDir: string) {
    this.eventsPath = join(dataDir, "events.jsonl");
    this.statePath = join(dataDir, "import-state.json");
  }

  async importLocalCodexSessions(includePaths = false, codexHome = defaultCodexHome()): Promise<ImportResult> {
    await this.load();
    const sessionDir = join(codexHome, "sessions");
    const files = await jsonlFiles(sessionDir);
    const state = await this.loadState();
    const nextState: ImportState = { files: {}, includePaths, sourceRoot: codexHome };
    const pathsChanged = state.includePaths !== includePaths;
    const rootChanged = state.sourceRoot !== codexHome;
    const imported = new Map<string, UsageEvent>();
    let firstTrackedAt: string | undefined;
    let lastTrackedAt: string | undefined;

    for (const file of files) {
      const fileStat = await stat(file);
      const key = relative(codexHome, file);
      const signature = { mtimeMs: fileStat.mtimeMs, size: fileStat.size };
      nextState.files[key] = signature;
      const previous = state.files[key];
      if (!pathsChanged && !rootChanged && previous && previous.mtimeMs === signature.mtimeMs && previous.size === signature.size) continue;
      const events = await parseCodexSession(await readFile(file, "utf8"), file, includePaths);
      for (const event of events) {
        imported.set(event.id, event);
        if (!firstTrackedAt || event.timestamp < firstTrackedAt) firstTrackedAt = event.timestamp;
        if (!lastTrackedAt || event.timestamp > lastTrackedAt) lastTrackedAt = event.timestamp;
      }
    }

    let changed = false;
    for (const [id, event] of imported) {
      const previous = this.events.get(id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(event)) {
        this.events.set(id, event);
        changed = true;
      }
    }
    if (changed) await this.persist();
    await this.persistState(nextState);
    return {
      filesScanned: files.length,
      filesImported: Object.entries(nextState.files).filter(([key, next]) => {
        const previous = state.files[key];
        return !previous || previous.mtimeMs !== next.mtimeMs || previous.size !== next.size;
      }).length,
      eventsImported: imported.size,
      firstTrackedAt,
      lastTrackedAt
    };
  }

  async analytics(): Promise<UsageAnalytics> {
    await this.load();
    const events = [...this.events.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const now = new Date();
    const starts = {
      today: startOfDay(now),
      week: new Date(now.getTime() - 7 * 86_400_000),
      month: new Date(now.getTime() - 30 * 86_400_000),
      year: new Date(now.getFullYear(), 0, 1)
    };
    const window = (start?: Date): UsageWindow => {
      const selected = start ? events.filter(event => new Date(event.timestamp) >= start) : events;
      return usageWindow(selected);
    };
    const byRepository = buckets(events, event => event.repository?.name ?? "Unknown repository");
    const byModel = buckets(events, event => event.model ?? "Unknown model");
    const byProvider = buckets(events, event => event.provider || "Unknown provider");
    const byYear = buckets(events, event => event.timestamp.slice(0, 4));
    const days = new Set(events.map(event => event.timestamp.slice(0, 10)));
    return {
      generatedAt: now.toISOString(),
      firstTrackedAt: events[0]?.timestamp,
      lastTrackedAt: events.at(-1)?.timestamp,
      eventCount: events.length,
      sessionCount: new Set(events.map(event => event.sessionId)).size,
      trackedDays: days.size,
      unknownRepositoryEvents: events.filter(event => !event.repository?.name).length,
      exact: events.length > 0,
      windows: {
        today: window(starts.today),
        week: window(starts.week),
        month: window(starts.month),
        year: window(starts.year),
        lifetime: window()
      },
      byRepository,
      byModel,
      byProvider,
      byYear,
      daily: dailyUsage(events).slice(-30)
    };
  }

  async eventsForExport(): Promise<UsageEvent[]> {
    await this.load();
    return [...this.events.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const lines = (await readFile(this.eventsPath, "utf8")).split("\n");
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as UsageEvent;
          if (event.schemaVersion === 1 && typeof event.id === "string") this.events.set(event.id, event);
        } catch {
          // Keep a corrupt line from hiding the rest of the local ledger.
        }
      }
    } catch {
      // No local ledger yet.
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.eventsPath), { recursive: true });
    const temporary = `${this.eventsPath}.new`;
    const content = [...this.events.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map(event => JSON.stringify(event)).join("\n");
    await writeFile(temporary, content ? `${content}\n` : "");
    await rename(temporary, this.eventsPath);
  }

  private async loadState(): Promise<ImportState> {
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as Partial<ImportState>;
      return {
        files: parsed.files && typeof parsed.files === "object" ? parsed.files : {},
        includePaths: parsed.includePaths,
        sourceRoot: parsed.sourceRoot
      };
    } catch {
      return { files: {} };
    }
  }

  private async persistState(state: ImportState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state));
  }
}

export async function parseCodexSession(raw: string, sourcePath: string, includePaths = false): Promise<UsageEvent[]> {
  let meta: Record<string, unknown> = {};
  let context: SessionContext = {
    sessionId: hash(sourcePath),
    provider: "openai"
  };
  const turns = new Map<string, UsageEvent>();

  for (const line of raw.split("\n")) {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    const payload = record(row.payload);
    const type = typeof payload.type === "string" ? payload.type : typeof row.type === "string" ? row.type : "";
    if (row.type === "session_meta") {
      meta = row;
      const sessionId = string(meta.session_id) ?? string(meta.id) ?? context.sessionId;
      const cwd = string(meta.cwd);
      context = {
        ...context,
        sessionId,
        timestamp: string(meta.timestamp),
        cwd,
        provider: string(meta.model_provider) ?? "openai",
        repository: repository(meta.git, cwd, includePaths)
      };
      continue;
    }
    if (type === "turn_context") {
      context = {
        ...context,
        cwd: string(payload.cwd) ?? context.cwd,
        model: string(payload.model) ?? context.model,
        turnId: string(payload.turn_id) ?? context.turnId,
        repository: repository(context.repository, string(payload.cwd) ?? context.cwd, includePaths)
      };
      continue;
    }
    if (type === "task_started") {
      context = { ...context, turnId: string(payload.turn_id) ?? context.turnId };
      continue;
    }
    if (type !== "token_count") continue;
    const info = record(payload.info);
    const last = record(info.last_token_usage);
    const timestamp = string(row.timestamp) ?? context.timestamp;
    if (!timestamp || !Object.keys(last).length) continue;
    const turnId = context.turnId ?? hash(`${sourcePath}:${timestamp}`);
    const event: UsageEvent = {
      schemaVersion: 1,
      id: hash(`${context.sessionId}:${turnId}`),
      timestamp,
      sessionId: context.sessionId,
      ...(context.turnId ? { turnId: context.turnId } : {}),
      provider: context.provider,
      ...(context.model ? { model: context.model } : {}),
      ...(context.repository ? { repository: context.repository } : {}),
      tokens: {
        input: finite(last.input_tokens),
        output: finite(last.output_tokens),
        cached: finite(last.cached_input_tokens),
        reasoning: finite(last.reasoning_output_tokens),
        total: finite(last.total_tokens)
      },
      source: "codex-session",
      confidence: "exact"
    };
    turns.set(event.id, event);
  }
  return [...turns.values()];
}

export function emptyAnalytics(now = new Date().toISOString()): UsageAnalytics {
  const empty = (): UsageWindow => ({ tokens: emptyTotals(), events: 0, sessions: 0, repositories: 0, models: 0 });
  return {
    generatedAt: now,
    eventCount: 0,
    sessionCount: 0,
    trackedDays: 0,
    unknownRepositoryEvents: 0,
    exact: false,
    windows: { today: empty(), week: empty(), month: empty(), year: empty(), lifetime: empty() },
    byRepository: [],
    byModel: [],
    byProvider: [],
    byYear: [],
    daily: []
  };
}

function usageWindow(events: UsageEvent[]): UsageWindow {
  return {
    tokens: sumTokens(events),
    events: events.length,
    sessions: new Set(events.map(event => event.sessionId)).size,
    repositories: new Set(events.map(event => event.repository?.name ?? "Unknown repository")).size,
    models: new Set(events.map(event => event.model ?? "Unknown model")).size
  };
}

function buckets(events: UsageEvent[], keyFor: (event: UsageEvent) => string): UsageBucket[] {
  const grouped = new Map<string, UsageEvent[]>();
  for (const event of events) {
    const key = keyFor(event);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }
  return [...grouped.entries()]
    .map(([key, selected]) => ({ key, label: key, events: selected.length, sessions: new Set(selected.map(event => event.sessionId)).size, tokens: sumTokens(selected) }))
    .sort((a, b) => b.tokens.total - a.tokens.total);
}

function dailyUsage(events: UsageEvent[]): DailyUsage[] {
  const grouped = new Map<string, UsageEvent[]>();
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    grouped.set(day, [...(grouped.get(day) ?? []), event]);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, selected]) => ({ date, tokens: sumTokens(selected), events: selected.length }));
}

function sumTokens(events: UsageEvent[]): TokenTotals {
  return events.reduce((total, event) => ({
    input: total.input + (event.tokens.input ?? 0),
    output: total.output + (event.tokens.output ?? 0),
    cached: total.cached + (event.tokens.cached ?? 0),
    reasoning: total.reasoning + (event.tokens.reasoning ?? 0),
    total: total.total + (event.tokens.total ?? 0)
  }), emptyTotals());
}

function repository(value: unknown, cwd: string | undefined, includePaths: boolean): { name?: string; remote?: string; path?: string } | undefined {
  const source = record(value);
  const remote = string(source.repository_url) ?? string(source.remote) ?? string(source.url);
  const name = remote ? repositoryName(remote) : cwd ? cwd.split(/[\\/]/).filter(Boolean).at(-1) : undefined;
  if (!name && !remote && !cwd) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(remote ? { remote } : {}),
    ...(includePaths && cwd ? { path: cwd } : {})
  };
}

function repositoryName(remote: string): string {
  const clean = remote.replace(/[\\/]$/, "").replace(/\.git$/, "");
  return clean.split(/[\\/:]/).filter(Boolean).at(-1) ?? clean;
}

function defaultCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
}

async function jsonlFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? jsonlFiles(path)
        : Promise.resolve(entry.isFile() && entry.name.endsWith(".jsonl") ? [path] : []);
    }));
    return nested.flat().sort();
  } catch {
    return [];
  }
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
