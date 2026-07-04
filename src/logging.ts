import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Settings } from "./models";

const ranks: Record<Settings["logLevel"], number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  constructor(readonly path: string, private level: Settings["logLevel"]) {}

  setLevel(level: Settings["logLevel"]): void {
    this.level = level;
  }

  async write(level: Settings["logLevel"], message: string): Promise<void> {
    if (ranks[level] > ranks[this.level]) return;
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, `${new Date().toISOString()} ${level.toUpperCase()} ${message}\n`);
  }

  async read(): Promise<string> {
    try {
      return await readFile(this.path, "utf8");
    } catch {
      return "No logs have been written yet.";
    }
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
