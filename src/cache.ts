import { UsageData } from "./models";

export class UsageCache {
  private value?: UsageData;
  private savedAt = 0;

  get(ttlSeconds: number): UsageData | undefined {
    if (!this.value || Date.now() - this.savedAt > ttlSeconds * 1000) return;
    return this.withAge();
  }

  stale(warning: string): UsageData | undefined {
    const value = this.withAge();
    return value && { ...value, warnings: [...value.warnings, warning] };
  }

  set(value: UsageData): UsageData {
    this.value = value;
    this.savedAt = Date.now();
    return this.withAge()!;
  }

  clear(): void {
    this.value = undefined;
    this.savedAt = 0;
  }

  private withAge(): UsageData | undefined {
    return this.value && { ...this.value, cacheAgeSeconds: Math.floor((Date.now() - this.savedAt) / 1000) };
  }
}
