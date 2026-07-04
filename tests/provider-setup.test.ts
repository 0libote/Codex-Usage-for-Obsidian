import { describe, expect, it } from "vitest";
import { providerFields, providerGuide } from "../src/provider-setup";

describe("provider setup", () => {
  it("shows only the fields a provider needs", () => {
    expect(providerFields("codex")).toEqual([]);
    expect(providerFields("opencode").map(field => field.key)).toEqual(["cookieHeader", "workspaceID"]);
    expect(providerFields("llmproxy").map(field => field.key)).toEqual(["apiKey", "enterpriseHost"]);
    expect(providerGuide("openai")).toContain("API key");
  });
});
