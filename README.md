# Codex Usage for Obsidian

An Obsidian plugin for displaying CodexBar-style AI coding usage data using managed local helpers.

This is an independent project. It is not an official CodexBar, Win-CodexBar, Obsidian, or OpenAI project.

## Status and platforms

The MVP supports Obsidian Desktop on macOS arm64/x64 and Windows x64. It is desktop-only because managed executables require Node/Electron APIs unavailable to Obsidian Mobile.

The plugin shows a compact status-bar summary and a dashboard containing remaining session and weekly quota, credits, cost, tokens, pace, account data, warnings, and expandable raw output. The display can be switched from remaining to used in settings.

The last successful snapshot is stored locally and displayed immediately on startup. Each successful refresh also writes a limited `Codex Usage/Dashboard.md` note so the current summary remains readable through normal vault sync on Windows and mobile. Raw output, logs, and credentials are excluded from that note.

Managed helper 0.38.1 packages are published separately for all supported targets and pinned by SHA-256 in the bundled manifest.

## Managed helpers

Users explicitly choose Install Helper or Update Helper. The plugin then:

1. selects the package for the current platform;
2. downloads it from the controlled URL in `helpers/manifest.json`;
3. verifies its SHA-256 checksum;
4. extracts it into the platform-native Codex Usage application-data directory;
5. runs it locally through its dedicated adapter.

Helpers are never silently updated. Codex and OpenRouter are queried separately; OpenRouter requires an API key configured in CodexBar. Provider-specific fields are retained in `raw`. Credentials, cookies, tokens, and browser sessions are neither copied nor synced.

See [Provider setup](docs/PROVIDER-SETUP.md) for managed CLI paths, Codex authentication, OpenRouter configuration, diagnostics, and cross-device behavior.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm test
npm run build
```

Copy or symlink this repository into:

```text
<vault>/.obsidian/plugins/codex-usage
```

Ensure `main.js`, `manifest.json`, and `styles.css` are present, enable community plugins, then enable **Codex Usage for Obsidian**.

## Releases

Push a semantic-version tag such as `0.2.0` or `v0.2.0`. `release.yml` removes an optional `v`, synchronizes `package.json`, `package-lock.json`, `manifest.json`, and `versions.json`, commits changed metadata to the default branch, runs tests/checks/build, attests `main.js`, `manifest.json`, and `styles.css`, and creates or updates the normalized release tag. Helper binaries remain in separate helper releases.

The daily helper watcher checks `steipete/CodexBar` and `Finesssee/Win-CodexBar`. For an unambiguous upstream CLI asset it builds a candidate package, calculates SHA-256, uploads it to a draft helper release, updates compatibility metadata, runs checks, and opens a pull request. It never auto-merges. A reviewer must test each target and publish the helper release.

## Troubleshooting

- **Helper missing:** Open plugin settings and choose Install Helper.
- **Manifest unavailable:** Confirm GitHub is reachable and the plugin version includes a published helper manifest.
- **Checksum failed:** The helper is not executed. Report the release URL and checksum.
- **Command or parse failure:** Run Diagnostics, inspect Raw Output, and check Obsidian’s developer console.
- **Provider setup:** Follow the [managed CLI provider guide](docs/PROVIDER-SETUP.md).
- **Logs:** Use Open Logs in plugin settings. Logs are stored beside the helper in the platform-native application-data directory and never written into notes.
- **Application data:** macOS uses `~/Library/Application Support/Codex Usage/`; Windows uses `%LOCALAPPDATA%\Codex Usage\`. The limited cross-device dashboard is stored at `Codex Usage/Dashboard.md` inside the vault.
- **Stale usage:** A refresh failed and the last successful cache entry is being shown with a warning.

## Security and attribution

See [SECURITY.md](SECURITY.md). Downloaded executables, caches, raw output, and logs remain in platform-native application data. Only the generated summary note is written into the vault.

CodexBar and Win-CodexBar are separate upstream projects with their own licences. Any redistributed helper release must include its exact upstream licence and notice files under `helpers/licences/`; this repository does not claim ownership of those components.

The Codex Usage plugin source is available under the [MIT License](LICENSE).
