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
