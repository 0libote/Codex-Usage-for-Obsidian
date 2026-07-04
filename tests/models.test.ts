import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/models";

describe("settings", () => {
  it("uses conservative refresh defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      cacheTtlSeconds: 60,
      refreshIntervalMinutes: 1,
      logLevel: "info"
    });
  });
});
