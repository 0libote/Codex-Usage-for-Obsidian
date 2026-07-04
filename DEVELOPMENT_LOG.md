# Development log

## 2026-07-04 — Plugin shell

- Changed: Added a buildable desktop-only Obsidian plugin with settings, status bar, dashboard placeholder, and commands.
- Why: Establish the smallest usable shell before adding executable management.
- Files: `package.json`, TypeScript/build config, plugin manifest, styles, `src/`.
- Checks: `npm install`, `npm run build`, settings-default test.
- Known issues: Helper actions are placeholders; no usage is collected yet.
- Next: Add the helper manifest, platform detection, secure installer, and adapters.
