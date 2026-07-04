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
