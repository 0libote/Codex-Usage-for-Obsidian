# Codex Usage for Obsidian

An Obsidian plugin for displaying CodexBar-style AI coding usage data using managed local helpers.

This is an independent project. It is not an official CodexBar, Win-CodexBar, Obsidian, or OpenAI project.

## Status and platforms

The MVP supports Obsidian Desktop on macOS arm64/x64 and Windows x64. It is desktop-only because managed executables require Node/Electron APIs unavailable to Obsidian Mobile.

The plugin shows a compact status-bar summary and a dashboard containing session and weekly usage, optional credits/cost/reset/account data, cache age, helper details, warnings, and expandable raw output.

The last successful snapshot is stored locally under the plugin directory and displayed immediately on startup. A fresh one-shot helper run begins three seconds after Obsidian loads, avoiding work on the critical startup path. Usage and cost helper processes terminate after each refresh and are stopped if the plugin unloads.

Managed helper 0.38.1 packages are published separately for all supported targets and pinned by SHA-256 in the bundled manifest.

## Managed helpers

Users explicitly choose Install Helper or Update Helper. The plugin then:

1. selects the package for the current platform;
2. downloads it from the controlled URL in `helpers/manifest.json`;
3. verifies its SHA-256 checksum;
4. extracts it into `.obsidian/plugins/codex-usage-for-obsidian/helpers/`;
5. runs it locally through its dedicated adapter.

Helpers are never silently updated. Provider-specific fields are retained in `raw`. Credentials, cookies, tokens, and browser sessions are neither copied nor synced.

## Development

Requires Node.js 20 or newer.

```sh
npm ci
npm test
npm run build
```

Copy or symlink this repository into:

```text
<vault>/.obsidian/plugins/codex-usage-for-obsidian
```

Ensure `main.js`, `manifest.json`, and `styles.css` are present, enable community plugins, then enable **Codex Usage for Obsidian**.

## Releases

Set the same version in `package.json`, `manifest.json`, and `versions.json`, run all checks, commit, then push a tag exactly matching the manifest version. `release.yml` publishes only the standard Obsidian files and a zip; helper binaries remain in separate helper releases.

The daily helper watcher checks `steipete/CodexBar` and `Finesssee/Win-CodexBar`. For an unambiguous upstream CLI asset it builds a candidate package, calculates SHA-256, uploads it to a draft helper release, updates compatibility metadata, runs checks, and opens a pull request. It never auto-merges. A reviewer must test each target and publish the helper release.

## Troubleshooting

- **Helper missing:** Open plugin settings and choose Install Helper.
- **Manifest unavailable:** Confirm GitHub is reachable and the plugin version includes a published helper manifest.
- **Checksum failed:** The helper is not executed. Report the release URL and checksum.
- **Command or parse failure:** Run Diagnostics, inspect Raw Output, and check Obsidian’s developer console.
- **Logs:** Use Open Logs in plugin settings. Logs are stored locally at `.obsidian/plugins/codex-usage-for-obsidian/logs/plugin.log` and never written into notes.
- **Stale usage:** A refresh failed and the last successful cache entry is being shown with a warning.

## Security and attribution

See [SECURITY.md](SECURITY.md). Downloaded executables live only in the plugin data folder, not in normal vault notes. Logs stay in Obsidian’s local developer console unless the user explicitly copies/exports them.

CodexBar and Win-CodexBar are separate upstream projects with their own licences. Any redistributed helper release must include its exact upstream licence and notice files under `helpers/licences/`; this repository does not claim ownership of those components.
