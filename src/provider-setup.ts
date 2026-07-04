import type { ProviderConfigInput } from "./helper-manager";

export type ProviderField = {
  key: keyof ProviderConfigInput;
  name: string;
  description: string;
  placeholder: string;
  secret?: boolean;
  multiline?: boolean;
};

const fields: Array<ProviderField & { providers: string[] }> = [
  {
    key: "apiKey",
    name: "API key",
    description: "Leave blank to keep the current device-local key.",
    placeholder: "Paste API key",
    secret: true,
    providers: [
      "openai", "azureopenai", "claude", "alibaba", "copilot", "zai", "minimax", "kimi", "kilo",
      "kimik2", "moonshot", "ollama", "synthetic", "warp", "openrouter", "elevenlabs", "doubao",
      "deepseek", "codebuff", "crof", "venice", "groq", "llmproxy", "litellm", "deepgram", "poe",
      "chutes", "crossmodel", "clawrouter"
    ]
  },
  {
    key: "cookieHeader",
    name: "Manual cookie header",
    description: "Optional. Leave blank to use automatic browser import.",
    placeholder: "Cookie: name=value; …",
    multiline: true,
    providers: [
      "claude", "cursor", "opencode", "opencodego", "alibaba", "alibabatokenplan", "factory", "devin",
      "minimax", "manus", "kimi", "augment", "amp", "t3chat", "ollama", "perplexity", "mimo", "sakana",
      "abacus", "mistral", "commandcode", "qoder"
    ]
  },
  {
    key: "workspaceID",
    name: "Workspace ID",
    description: "Optional OpenCode workspace ID or workspace URL.",
    placeholder: "Workspace ID",
    providers: ["opencode", "opencodego"]
  },
  {
    key: "enterpriseHost",
    name: "Base URL",
    description: "HTTPS endpoint for this provider.",
    placeholder: "Provider URL",
    providers: ["llmproxy", "litellm", "clawrouter"]
  },
  {
    key: "region",
    name: "Region",
    description: "Optional provider region.",
    placeholder: "Region",
    providers: ["minimax", "moonshot", "alibaba"]
  }
];

export function providerFields(provider: string): ProviderField[] {
  return fields.filter(field => field.providers.includes(provider)).map(({ providers: _, ...field }) => field);
}

export function providerGuide(provider: string): string {
  const configured = providerFields(provider);
  const apiKey = configured.some(field => field.key === "apiKey");
  const cookie = configured.some(field => field.key === "cookieHeader");
  if (provider === "opencode" || provider === "opencodego") {
    return "Sign in at opencode.ai in Chrome or Dia. Use a manual cookie only if browser import is unavailable.";
  }
  if (apiKey && cookie) return "Paste an API key, or sign in through a supported browser and leave the fields blank.";
  if (apiKey) return "Create an API key in the provider console, paste it below, then save.";
  return "Sign in through a supported browser. Use a manual cookie only if automatic import is unavailable.";
}
