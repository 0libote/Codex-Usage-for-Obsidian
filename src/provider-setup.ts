import type { ProviderConfigInput } from "./helper-manager";

export type ProviderField = {
  key: keyof ProviderConfigInput;
  name: string;
  description: string;
  placeholder: string;
  secret?: boolean;
  multiline?: boolean;
};

const API_KEY: ProviderField = {
  key: "apiKey",
  name: "API key",
  description: "Required. Stored only in the CLI configuration on this device.",
  placeholder: "Paste API key",
  secret: true
};

const COOKIE: ProviderField = {
  key: "cookieHeader",
  name: "Cookie header",
  description: "Required. Copy the Cookie request header from the provider site.",
  placeholder: "name=value; …",
  multiline: true
};

const HOST: ProviderField = {
  key: "enterpriseHost",
  name: "Base URL",
  description: "Required HTTPS endpoint for this provider.",
  placeholder: "https://provider.example"
};

// Add API-key providers here. Only exceptions need code below.
const API_KEY_PROVIDERS = new Set([
  "openai", "zai", "kimik2", "moonshot", "synthetic", "warp", "openrouter", "elevenlabs",
  "doubao", "deepseek", "crof", "venice", "groq", "llmproxy", "litellm", "deepgram", "poe",
  "chutes", "crossmodel", "clawrouter"
]);

export function providerFields(provider: string): ProviderField[] {
  if (provider === "sakana") return [COOKIE];
  if (provider === "llmproxy" || provider === "litellm") return [API_KEY, HOST];
  return API_KEY_PROVIDERS.has(provider) ? [API_KEY] : [];
}

export function providerGuide(provider: string): string {
  if (provider === "codex") return "Sign in with the Codex CLI. The helper reads that login automatically.";
  if (provider === "opencode" || provider === "opencodego") {
    return "Sign in at opencode.ai in a supported browser. The helper imports that session automatically.";
  }
  if (provider === "sakana") {
    return "In console.sakana.ai, open developer tools, copy the Cookie request header, then save and enable.";
  }
  return API_KEY_PROVIDERS.has(provider)
    ? "Create an API key in the provider console, paste the required details, then save and enable."
    : "Complete sign-in in the provider CLI, app, or browser, then enable it here. No credentials are needed.";
}
