# Provider support

Codex Usage includes a managed CodexBar-compatible CLI. The CLI understands many providers, but this plugin currently collects and displays **Codex only**.

## What works

| Provider | Managed helper | Plugin dashboard |
| --- | --- | --- |
| Codex | Supported | Supported |
| OpenCode, Claude, Cursor, and others | Supported when correctly authenticated | Not yet supported |

Enabling a non-Codex provider changes the helper configuration only. It does not add that provider to the dashboard because the plugin currently runs `usage --provider codex`.

## Codex setup

1. Install the Codex CLI.
2. Run `codex login`.
3. Install the managed helper from **Settings → Codex Usage**.
4. Refresh the dashboard.

The helper reads the existing Codex CLI authentication and local Codex session history.

## OpenCode

OpenCode is supported by the managed helper, but not by this plugin dashboard yet.

- OpenCode reads an `opencode.ai` browser session. An OpenCode CLI login alone is not a supported source.
- OpenCode Go can also read `~/.local/share/opencode/opencode.db` on macOS and Linux.
- Enabling OpenCode in the plugin settings will not display its data until multi-provider collection is implemented.

See the upstream [CodexBar provider documentation](https://github.com/steipete/CodexBar/blob/v0.38.1/docs/providers.md#opencode) for its exact authentication sources.

## Advanced helper checks

The managed CLI is stored at:

- macOS Apple silicon: `~/Library/Application Support/Codex Usage/helpers/macos-arm64/CodexBarCLI`
- macOS Intel: `~/Library/Application Support/Codex Usage/helpers/macos-x64/CodexBarCLI`
- Windows: `%LOCALAPPDATA%\Codex Usage\helpers\windows-x64\codexbar-cli.exe`

The exact path appears under **Settings → Codex Usage → Application data location**.

Replace `<managed-cli>` below with that path.

List providers known to the helper:

```text
<managed-cli> config providers --format json --pretty
```

Test a provider directly:

```text
<managed-cli> usage --provider <provider-id> --format json --json-only
```

Run redacted diagnostics:

```text
<managed-cli> diagnose --provider <provider-id> --format json --redact
```

A provider appearing in `config providers` means the helper knows how to query it. It does not mean the Obsidian dashboard supports it.

## Limits

- The dashboard and generated note currently contain Codex data only.
- Browser and local-application discovery vary by operating system and provider.
- Mobile cannot run the helper; it can only read the generated `Codex Usage/Dashboard.md`.
- Never share API keys, cookies, account tokens, or unredacted diagnostics.
