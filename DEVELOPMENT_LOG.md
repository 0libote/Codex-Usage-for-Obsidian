# Development log

## 2026-07-04 — Plugin shell

- Changed: Added a buildable desktop-only Obsidian plugin with settings, status bar, dashboard placeholder, and commands.
- Why: Establish the smallest usable shell before adding executable management.
- Files: `package.json`, TypeScript/build config, plugin manifest, styles, `src/`.
- Checks: `npm install`, `npm run build`, settings-default test.
- Known issues: Helper actions are placeholders; no usage is collected yet.
- Next: Add the helper manifest, platform detection, secure installer, and adapters.

## 2026-07-04 — Managed helper core

- Changed: Added target detection, validated helper manifest, checksum-gated atomic installer, adapters, structured errors, normalisation, raw preservation, cache fallback, dashboard cards, settings status/actions, and explicit install confirmation.
- Why: Keep downloads and every upstream command assumption behind one helper boundary.
- Files: `helpers/`, helper/adapters/cache model modules, plugin UI, core tests.
- Checks: `npm run typecheck`, `npm test` (6 passing), `npm run build`.
- Known issues: Manifest release coordinates and checksums are intentionally placeholders, so installation fails safely until controlled helper assets exist.
- Next: Add fixtures, workflows, documentation, and release/update automation.

## 2026-07-04 — Tests, automation, and documentation

- Changed: Added macOS/Windows parser fixtures, CI, plugin release automation, conservative upstream helper update PR automation, README, and security policy.
- Why: Make plugin releases reproducible and helper changes reviewable without silently trusting upstream binaries.
- Files: `fixtures/`, `.github/workflows/`, `scripts/`, `README.md`, `SECURITY.md`.
- Checks: helper script syntax, workflow YAML parse, `npm run typecheck`, `npm test` (8 passing), `npm run build`.
- Known issues: A maintainer must publish real controlled helper assets, replace manifest placeholders, add exact upstream licence files, and manually smoke-test candidates.
- Next: Publish first reviewed helper candidates, then test in an Obsidian desktop vault.

## 2026-07-04 — Platform hardening

- Changed: Preserved archive extensions for Windows extraction, distinguished broken helper metadata from a missing binary, declared adapter cost commands, and tested helper state transitions.
- Why: PowerShell requires `.zip` input and settings must report repairable installations accurately.
- Files: helper manager, adapters, tests.
- Checks: `npm run typecheck`, `npm test` (9 passing), `npm run build`, helper script syntax, `git diff --check`.
- Known issues: Real helper command syntax must be validated against the first reviewed upstream packages.
- Next: Publish and smoke-test controlled helper candidates.

## 2026-07-04 — Real helper packaging

- Changed: Verified upstream 0.38.1 release assets and CLI documentation, corrected commands and quota parsing, added exact upstream licences, and added a cross-platform helper packaging/release workflow.
- Why: macOS ships standalone CLIs while Windows embeds its CLI in the signed installer; packaging must follow each actual release shape.
- Files: adapters, fixtures/tests, licence notices, helper publishing workflow.
- Checks: macOS arm64 CLI version/help, typecheck, 10 tests, production build, workflow YAML parse, diff check; pending Windows runner smoke test.
- Known issues: Manifest remains unchanged until all three controlled packages are produced and their checksums recorded.
- Next: Run the helper publishing workflow, update manifest checksums, then exercise install and usage locally.

## 2026-07-04 — Helper release 0.38.1

- Changed: Published separate controlled helper packages for macOS arm64/x64 and Windows x64, then pinned their release URLs and SHA-256 values.
- Why: Users need verified one-click installation without separately installing either upstream project.
- Files: helper manifest, compatibility notes, README.
- Checks: GitHub run 28711696520 passed all macOS, Windows, packaging, and release jobs.
- Known issues: Provider usage requires the user's existing local Codex authentication.
- Next: Run the plugin installer and usage adapter end to end on macOS.

## 2026-07-04 — Live output compatibility

- Changed: Accepted CodexBar's current JSON array output while preserving every payload in `raw`.
- Why: The controlled helper installed correctly, but live 0.38.1 output wraps provider payloads in an array.
- Files: adapter parser and compatibility test.
- Checks: Live managed download/install/execute/remove; normalized session and weekly fields; typecheck; 11 tests; production build; diff check.
- Known issues: None identified in the macOS helper path.
- Next: Commit and publish the pinned manifest.
