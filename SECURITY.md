# Security policy

## Managed executable model

Codex Usage for Obsidian downloads and runs a platform-specific local helper only after explicit user confirmation. The configured helper manifest is bundled with the reviewed plugin release. Downloads must use the controlled GitHub release URLs in that manifest and must have a valid SHA-256 value.

The plugin verifies the downloaded archive before extraction or execution. A mismatch stops installation. Updates are user-initiated and are never applied silently. Users can remove the installed helper from plugin settings.

Helpers are stored under:

```text
<vault>/.obsidian/plugins/codex-usage-for-obsidian/helpers/
```

They are not placed in normal notes. Runtime errors are written to Obsidian's local developer console; helper output is shown only in diagnostics/raw-output UI unless the user explicitly exports it.

The plugin does not collect, copy, log, or sync credentials, browser cookies, sessions, tokens, or other secrets. Upstream helpers may independently access locally configured provider state; review their security documentation before installation.

## Reporting

Do not open a public issue for an unpatched vulnerability. Use GitHub's private security advisory reporting for this repository. Include the plugin version, platform, helper package version, reproduction steps, and impact. Remove tokens, cookies, account identifiers, and other personal data from diagnostics.

No support or affiliation is implied with OpenAI, CodexBar, Win-CodexBar, or Obsidian.
