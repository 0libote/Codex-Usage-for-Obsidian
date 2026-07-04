# Provider setup

Codex Usage runs its managed CodexBar-compatible CLI in the background. Authentication must be available to that CLI, not only to another terminal or application.

The bundled CLI currently exposes the providers below. The plugin dashboard currently collects **Codex only**; the remaining entries document CLI capability and setup for future dashboard support.

## Managed CLI paths

- macOS Apple silicon: `~/Library/Application Support/Codex Usage/helpers/macos-arm64/CodexBarCLI`
- macOS Intel: `~/Library/Application Support/Codex Usage/helpers/macos-x64/CodexBarCLI`
- Windows: `%LOCALAPPDATA%\Codex Usage\helpers\windows-x64\codexbar-cli.exe`

The exact binary path is shown under **Settings → Codex Usage → Application data location**.

In the commands below, replace `<managed-cli>` with that path.

## Common commands

List providers:

```text
<managed-cli> config providers --format json --pretty
```

Enable a provider:

```text
<managed-cli> config enable --provider <provider-id>
```

Store a supported API key without putting it on the command line:

```text
printf '%s' "$PROVIDER_API_KEY" | <managed-cli> config set-api-key --provider <provider-id> --stdin
```

PowerShell equivalent:

```powershell
$secret = Read-Host "API key" -AsSecureString
$key = [Net.NetworkCredential]::new("", $secret).Password
$key | & "<managed-cli>" config set-api-key --provider <provider-id> --stdin
Remove-Variable key, secret
```

`set-api-key` also enables the provider. Browser, local application, CLI-login, OAuth, and cloud-credential providers should use their setup in the table instead.

## All providers

| Provider (`id`) | Setup |
| --- | --- |
| Codex (`codex`) | Install the Codex CLI, run `codex login`, then refresh. |
| OpenAI (`openai`) | Store an OpenAI Admin API key with `set-api-key`; a normal API key exposes less billing data. |
| Azure OpenAI (`azureopenai`) | Set `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, and `AZURE_OPENAI_DEPLOYMENT_NAME`. |
| Claude (`claude`) | Run `claude` and sign in, use a browser session, or store an Anthropic Admin API key with `set-api-key`. |
| Cursor (`cursor`) | Sign in at `cursor.com` in a supported browser, then enable the provider. |
| OpenCode (`opencode`) | Sign in at `opencode.ai` in a supported browser, then enable the provider. |
| OpenCode Go (`opencodego`) | Sign in at `opencode.ai`; local usage can also come from the OpenCode SQLite database. |
| Alibaba Coding Plan (`alibaba`) | Sign in to the Alibaba console in a supported browser, or store a Coding Plan API key with `set-api-key`. |
| Alibaba Token Plan (`alibabatokenplan`) | Sign in to Bailian in a supported browser; manual cookie setup is also supported upstream. |
| Droid / Factory (`factory`) | Sign in to Factory in a supported browser or local Factory application. |
| Gemini (`gemini`) | Install the Gemini CLI, run `gemini`, and complete its Google sign-in. |
| Antigravity (`antigravity`) | Launch Antigravity so its local language server is available. |
| Copilot (`copilot`) | Complete GitHub Copilot device authentication or store a Copilot token with `set-api-key`. |
| Devin (`devin`) | Sign in at `app.devin.ai` in Chrome; a manual bearer token is also supported upstream. |
| z.ai (`zai`) | Store a z.ai API key with `set-api-key`. Team accounts additionally need organization and workspace IDs. |
| MiniMax (`minimax`) | Store a Coding Plan API key with `set-api-key`, or use a supported browser session. |
| Manus (`manus`) | Sign in to Manus in a supported browser; `MANUS_SESSION_TOKEN` is the environment fallback. |
| Kimi (`kimi`) | Store a Kimi Code API key with `set-api-key`, or use a `kimi-auth` browser session. |
| Kilo (`kilo`) | Run `kilo login`, or store a Kilo API key with `set-api-key`. |
| Kiro (`kiro`) | Install `kiro-cli` and sign in with AWS Builder ID. |
| Vertex AI (`vertexai`) | Run `gcloud auth application-default login` and ensure Cloud Monitoring access in the active project. |
| Augment (`augment`) | Install and sign in to `auggie`, or sign in at `app.augmentcode.com` in a supported browser. |
| JetBrains AI (`jetbrains`) | Install a JetBrains IDE, enable AI Assistant, and launch the IDE at least once. |
| Kimi K2, unofficial (`kimik2`) | Store a Kimi K2 API key with `set-api-key`. |
| Moonshot / Kimi API (`moonshot`) | Store a Moonshot API key with `set-api-key`; set `MOONSHOT_REGION` when needed. |
| Amp (`amp`) | Install and sign in to the `amp` CLI, store an access token, or use an Amp browser session. |
| T3 Chat (`t3chat`) | Sign in at `t3.chat` in a supported browser. |
| Ollama (`ollama`) | Sign in at `ollama.com` for cloud quota, or store an Ollama API key with `set-api-key`. |
| Synthetic (`synthetic`) | Store a Synthetic API key with `set-api-key`. |
| Warp (`warp`) | Store a Warp API key with `set-api-key`. |
| OpenRouter (`openrouter`) | Store an OpenRouter API key with `set-api-key`. |
| ElevenLabs (`elevenlabs`) | Store an ElevenLabs API key with `set-api-key`. |
| Windsurf (`windsurf`) | Install, launch, and sign in to Windsurf; browser session import is also supported. |
| Zed (`zed`) | Install Zed and sign in with GitHub. The CLI reads the local Zed session. |
| Perplexity (`perplexity`) | Sign in to Perplexity in a supported browser; a manual session token is also supported. |
| Xiaomi MiMo (`mimo`) | Sign in at `platform.xiaomimimo.com` in a supported browser. |
| Doubao (`doubao`) | Store a Volcengine Ark/Doubao API key with `set-api-key`. |
| Sakana AI (`sakana`) | Supply a manual Cookie header from `console.sakana.ai`; automatic browser import is unavailable. |
| Abacus AI (`abacus`) | Sign in at `apps.abacus.ai` in a supported browser. |
| Mistral (`mistral`) | Sign in at `admin.mistral.ai` or `console.mistral.ai` in a supported browser. |
| DeepSeek (`deepseek`) | Store a DeepSeek API key with `set-api-key`. |
| Codebuff (`codebuff`) | Run `codebuff login`, or store a Codebuff API key with `set-api-key`. |
| Crof (`crof`) | Store a Crof API key with `set-api-key`. |
| Venice (`venice`) | Store a Venice API key with `set-api-key`. |
| Command Code (`commandcode`) | Sign in at `commandcode.ai` in Chrome. |
| Qoder (`qoder`) | Sign in at `qoder.com` or `qoder.com.cn` in Chrome. |
| StepFun (`stepfun`) | Set `STEPFUN_USERNAME` and `STEPFUN_PASSWORD`, or configure a manual Oasis token upstream. |
| AWS Bedrock (`bedrock`) | Configure standard AWS credentials and region variables; Cost Explorer permissions are required. |
| Grok (`grok`) | Install the Grok CLI and run `grok login`; Chrome session and local-session fallbacks are also supported. |
| GroqCloud (`groq`) | Store a Groq API key with `set-api-key`; usage metrics require the appropriate Groq plan. |
| LLM Proxy (`llmproxy`) | Store its API key with `set-api-key` and set `LLM_PROXY_BASE_URL`. |
| LiteLLM (`litellm`) | Store its API key with `set-api-key` and set `LITELLM_BASE_URL`. |
| Deepgram (`deepgram`) | Store a Deepgram API key with `set-api-key`; `DEEPGRAM_PROJECT_ID` is optional. |
| Poe (`poe`) | Store a Poe API key with `set-api-key`. |
| Chutes (`chutes`) | Store a Chutes API key with `set-api-key`. |
| CrossModel (`crossmodel`) | Store a CrossModel API key with `set-api-key`. |
| ClawRouter (`clawrouter`) | Store a ClawRouter API key with `set-api-key`; a custom base URL is optional. |

## Verify and diagnose

Query one provider:

```text
<managed-cli> usage --provider <provider-id> --format json --json-only
```

Run redacted diagnostics:

```text
<managed-cli> diagnose --provider <provider-id> --format json --redact
```

Use **Settings → Codex Usage → Run diagnostics** when possible. Do not share unredacted output, API keys, cookies, or account tokens.

## Platform limitations

- Browser and local-application discovery depends on what the upstream macOS or Windows helper implements.
- Some providers need extra endpoint, region, organization, project, or workspace values beyond the primary credential.
- A provider appearing in `config providers` means the bundled CLI knows about it. It does not mean this plugin dashboard collects it yet.
- Mobile cannot run the helper. It can read the synced `Codex Usage/Dashboard.md` snapshot.

## Why keys are not stored in Obsidian settings

Obsidian plugin settings may be copied or synced with the vault. Keeping secrets in the CLI configuration avoids placing them in the vault, generated dashboard, or plugin settings. The upstream CLI writes its configuration with user-only file permissions.
