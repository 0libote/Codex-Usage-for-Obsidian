import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const manifestPath = "helpers/manifest.json";
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const groups = [
  { project: "steipete/CodexBar", targets: ["macos-arm64", "macos-x64"] },
  { project: "Finesssee/Win-CodexBar", targets: ["windows-x64"] }
];
const changed = [];

for (const group of groups) {
  const release = await api(`https://api.github.com/repos/${group.project}/releases/latest`);
  const version = release.tag_name.replace(/^v/, "");
  for (const target of group.targets) {
    const current = manifest.helpers[target];
    if (current.upstreamVersion === version) continue;
    const old = current.upstreamVersion;
    const asset = selectAsset(release.assets, target);
    if (!asset) throw new Error(`No unambiguous CLI asset found for ${group.project} ${target}; review upstream assets manually.`);

    const temp = mkdtempSync(join(tmpdir(), "codex-helper-"));
    const archive = join(temp, basename(asset.name));
    writeFileSync(archive, Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()));
    const extracted = join(temp, "extracted");
    execFileSync("mkdir", ["-p", extracted]);
    asset.name.endsWith(".zip")
      ? execFileSync("unzip", ["-q", archive, "-d", extracted])
      : execFileSync("tar", ["-xzf", archive, "-C", extracted]);
    const binary = find(extracted, current.binaryName);
    if (!binary) throw new Error(`${current.binaryName} was not found in ${asset.name}.`);

    const packageName = current.assetName;
    const packagePath = join(temp, packageName);
    packageName.endsWith(".zip")
      ? execFileSync("zip", ["-j", packagePath, binary])
      : execFileSync("tar", ["-czf", packagePath, "-C", dirname(binary), basename(binary)]);
    const sha256 = createHash("sha256").update(readFileSync(packagePath)).digest("hex");
    const tag = `helpers-${new Date().toISOString().slice(0, 10)}-${version}`;
    try {
      execFileSync("gh", ["release", "view", tag], { stdio: "ignore" });
    } catch {
      execFileSync("gh", ["release", "create", tag, "--draft", "--title", `Managed helpers ${tag}`, "--notes", "Automated helper candidates; publish only after manual review."]);
    }
    execFileSync("gh", ["release", "upload", tag, packagePath, "--clobber"]);

    current.upstreamVersion = version;
    current.ourPackageVersion = `${new Date().toISOString().slice(0, 10).replaceAll("-", ".")}-${target}`;
    current.downloadUrl = `https://github.com/${process.env.REPOSITORY}/releases/download/${tag}/${packageName}`;
    current.sha256 = sha256;
    changed.push({ project: group.project, target, old, version, asset: asset.name, sha256 });
  }
}

if (!changed.length) {
  writeFileSync(".helper-update-pr.md", "No helper updates were found.\n");
  process.exit(0);
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
const rows = changed.map(x => `| ${x.target} | ${x.old} | ${x.version} | ${x.asset} | \`${x.sha256}\` |`).join("\n");
writeFileSync("helpers/compatibility-notes.md", `# Helper compatibility notes\n\nAutomated candidate update generated ${new Date().toISOString()}.\n\n${rows}\n\nParser and build checks run in the workflow. Manual helper smoke testing remains required.\n`);
writeFileSync(".helper-update-pr.md", `## Managed helper update\n\n| Target | Old | New | Upstream asset | SHA-256 |\n|---|---|---|---|---|\n${rows}\n\n- [ ] Confirm upstream licences/notices\n- [ ] Run each helper on its target OS\n- [ ] Review parser fixture compatibility\n- [ ] Confirm package release URLs\n\nThis PR is never auto-merged.\n`);

async function api(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${process.env.GH_TOKEN}`, "User-Agent": "codex-usage-helper-watcher" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function selectAsset(assets, target) {
  const architecture = target.endsWith("arm64") ? /(arm64|aarch64)/i : /(x64|x86_64|amd64)/i;
  const platform = target.startsWith("macos") ? /(mac|darwin)/i : /(win)/i;
  const matches = assets.filter(asset => platform.test(asset.name) && architecture.test(asset.name) && /\.(zip|tar\.gz)$/i.test(asset.name));
  return matches.length === 1 ? matches[0] : undefined;
}

function find(directory, name) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      const found = find(path, name);
      if (found) return found;
    } else if (entry.toLowerCase() === name.toLowerCase()) return path;
  }
}
