# Development log

## 2026-07-04 — Plugin shell

- Added the desktop-only Obsidian plugin, settings, status bar, dashboard, commands, build configuration, and settings-default test.
- Checks: build and initial test passed.
- Outcome: completed; helper placeholders were replaced in later milestones.

## 2026-07-04 — Managed helper core

- Added platform detection, the validated helper manifest, checksum-gated atomic installation, adapters, structured errors, raw-output preservation, caching, settings controls, and explicit install confirmation.
- Checks: typecheck, six tests, and build passed.
- Outcome: completed; release placeholders were replaced with pinned helper 0.38.1 assets.

## 2026-07-04 — Tests, automation, and documentation

- Added macOS/Windows fixtures, CI, plugin release automation, upstream update automation, README, and security policy.
- Checks: workflow syntax, typecheck, eight tests, and build passed.
- Outcome: completed; exact upstream licence files and controlled assets were subsequently published.

## 2026-07-04 — Platform hardening

- Preserved Windows archive extensions, distinguished broken from missing installations, centralized verified adapter commands, and tested helper state transitions.
- Checks: typecheck, nine tests, build, script syntax, and diff check passed.
- Outcome: completed.

## 2026-07-04 — Real helper packaging

- Verified upstream CodexBar and Win-CodexBar 0.38.1 releases and CLI documentation.
- Added exact upstream licences and cross-platform helper packaging.
- Checks: macOS CLI version/help, Windows runner extraction/version/help, typecheck, ten tests, build, and workflow syntax passed.
- Outcome: controlled helper packages were published for all supported targets.

## 2026-07-04 — Helper release 0.38.1

- Published separate helper assets in this repository for macOS arm64/x64 and Windows x64.
- Pinned every URL and SHA-256 value in `helpers/manifest.json`.
- Checks: GitHub run 28711696520 passed all packaging and release jobs.
- Outcome: one-click helper installation enabled.

## 2026-07-04 — Live output compatibility

- Added support for CodexBar’s JSON array output while retaining every provider payload in `raw`.
- Checks: live macOS download/install/execute/remove, typecheck, eleven tests, build, and diff check passed.
- Outcome: session and weekly usage normalized successfully from live data.

## 2026-07-04 — Linux CI portability

- Made the helper target injectable so tests do not attempt to run an unsupported Linux helper.
- Checks: local suite and GitHub CI run 28711788551 passed.
- Outcome: CI green; Linux remains intentionally outside plugin runtime support.

## 2026-07-04 — Cost, persisted cache, lifecycle, and logs

- Added actual cost-command collection, full raw cost preservation, persisted last-good data, delayed startup refresh, managed child-process shutdown/restart, and local plugin logs.
- Updated author metadata to 0libote.
- Files: helper manager, adapters, cache, logger, plugin UI, tests, manifest, README.
- Checks: live usage/cost collection, raw cost preservation, persisted-cache reload, file logging, typecheck, 14 tests, production build, script/workflow syntax, and diff check passed.
- Current limitation: cost data depends on locally available Codex history; usage depends on the user’s existing Codex authentication.
- Next: publish plugin 0.1.1; 0.1.0 already contains the earlier MVP build.

## 2026-07-04 — Tag-driven plugin releases

- Changed: Release tags now synchronize all version files, run tests/checks/build, commit metadata changes, attest plugin artifacts, and create or update the normalized release.
- Why: A tag is the single release-version input while Obsidian still receives its standard files.
- Files: release workflow, package scripts, README.
- Checks: workflow YAML parse, typecheck, 14 tests, production build, and diff check passed.
- Current limitation: the workflow requires permission to push version metadata to the default branch.
- Next: verify the complete automation with the next release tag.

## 2026-07-04 — Standard Obsidian release assets

- Changed: Removed the generated ZIP and `versions.json` attachment from plugin releases.
- Why: Obsidian installs only `main.js`, `manifest.json`, and optional `styles.css`; `versions.json` remains source metadata.
- Files: release workflow and README.
- Checks: workflow YAML parse, typecheck, 14 tests, production build, and diff check passed.
- Next: clean the redundant assets from release 0.1.2.

## 2026-07-04 — Community review metadata

- Changed: Added the MIT project licence and user-facing 0.1.2 release notes.
- Verified: repository and release manifests match; the release contains only `main.js`, `manifest.json`, and `styles.css`.
- Files: licence, package metadata, README, release description.
- Checks: typecheck, 14 tests, production build, and diff check passed.
- Next: rerun community review after GitHub recognizes the licence.
