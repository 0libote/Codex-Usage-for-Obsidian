import { join } from "node:path";
import { ItemView, Modal, Notice, normalizePath, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { appDataDir } from "./app-data";
import { CodexUsageError } from "./errors";
import { HelperManager, HelperStatus } from "./helper-manager";
import { Logger } from "./logging";
import { DEFAULT_SETTINGS, Settings, UsageData } from "./models";

const VIEW_TYPE = "codex-usage-dashboard";

export default class CodexUsagePlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  data: UsageData | null = null;
  manager!: HelperManager;
  logger!: Logger;
  private statusBar?: HTMLElement;
  private refreshTimer?: number;

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData() as unknown);
    const dataDir = appDataDir();
    this.logger = new Logger(join(dataDir, "logs", "plugin.log"), this.settings.logLevel);
    this.manager = new HelperManager(dataDir, undefined, this.logger);
    this.registerView(VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.addSettingTab(new CodexUsageSettings(this));
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText("Codex —");
    this.statusBar.addEventListener("click", () => void this.openDashboard());
    this.addRibbonIcon("gauge", "Open codex usage", () => void this.openDashboard());

    const commands: Array<[string, string, () => void | Promise<void>]> = [
      ["open-dashboard", "Codex Usage: Open Dashboard", () => this.openDashboard()],
      ["refresh-usage", "Codex Usage: Refresh Usage", () => this.refresh(true)],
      ["install-helper", "Codex Usage: Install Helper", () => this.installHelper()],
      ["update-helper", "Codex Usage: Update Helper", () => this.installHelper()],
      ["restart-helper", "Codex Usage: Restart Helper", () => this.restartHelper()],
      ["run-diagnostics", "Codex Usage: Run Diagnostics", () => this.diagnostics()],
      ["show-raw-output", "Codex Usage: Show Raw Output", () => this.showRaw()],
      ["open-settings", "Codex Usage: Open Settings", () =>
        (this.app as typeof this.app & { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id)]
    ];
    for (const [id, name, callback] of commands) this.addCommand({ id, name, callback });
    this.data = await this.manager.cached() ?? null;
    if (this.data) this.updateStatusBar();
    const startupTimer = window.setTimeout(() => void this.startupRefresh(), 3_000);
    this.register(() => window.clearTimeout(startupTimer));
    this.scheduleRefresh();
    await this.logger.write("info", "Plugin loaded; helper startup delayed by 3 seconds.");
  }

  onunload(): void {
    this.manager.stop();
    void this.logger.write("info", "Plugin unloaded; active helper processes stopped.");
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.logger.setLevel(this.settings.logLevel);
    await this.writeSyncedDashboard();
  }

  async openDashboard(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  async refresh(bypassCache = false): Promise<void> {
    try {
      this.data = await this.manager.usage(this.settings.cacheTtlSeconds, bypassCache);
      this.updateStatusBar();
      await this.writeSyncedDashboard();
      this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
    } catch (error) {
      this.showError(error);
    }
  }

  async installHelper(): Promise<void> {
    const status = await this.manager.status();
    new ConfirmModal(this, status, async () => {
      try {
        await this.manager.install();
        new Notice("Managed helper installed.");
        await this.refresh(true);
      } catch (error) {
        this.showError(error);
      }
    }).open();
  }

  async diagnostics(): Promise<void> {
    try {
      new TextModal(this, "Codex Usage diagnostics", await this.manager.diagnostics()).open();
    } catch (error) {
      this.showError(error);
    }
  }

  async restartHelper(): Promise<void> {
    this.manager.stop();
    await this.logger.write("info", "Helper restart requested.");
    await this.refresh(true);
  }

  async showLogs(): Promise<void> {
    new TextModal(this, "Codex Usage logs", await this.logger.read()).open();
  }

  showRaw(): void {
    new TextModal(this, "Codex Usage raw output", JSON.stringify(this.data?.raw ?? {}, null, 2)).open();
  }

  async clearCache(): Promise<void> {
    await this.manager.clearCache();
    this.data = null;
    this.statusBar?.setText("Codex —");
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
  }

  private updateStatusBar(): void {
    const session = this.data?.usage.session;
    const percent = session?.percent ?? session?.usedPercent ?? session?.usagePercent;
    const reset = session?.resetsAt ?? session?.resetAt;
    const resetText = typeof reset === "string" || typeof reset === "number" ? ` · resets ${reset}` : "";
    this.statusBar?.setText(`Codex ${typeof percent === "number" ? `${percent}%` : "ready"}${resetText}`);
  }

  private async writeSyncedDashboard(): Promise<void> {
    if (!this.data) return;
    const path = normalizePath("Codex Usage/Dashboard.md");
    const folder = path.slice(0, path.lastIndexOf("/"));
    if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const content = dashboardMarkdown(this.data, this.settings.usageDisplay);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.vault.modify(file, content);
    else await this.app.vault.create(path, content);
  }

  scheduleRefresh(): void {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(
      () => void this.refresh(),
      this.settings.refreshIntervalMinutes * 60_000
    );
    this.register(() => window.clearInterval(this.refreshTimer));
  }

  private async startupRefresh(): Promise<void> {
    if ((await this.manager.status()).state !== "Missing") await this.refresh(true);
  }

  showError(error: unknown): void {
    const message = error instanceof CodexUsageError ? `${error.message}${error.details ? ` ${error.details}` : ""}` : String(error);
    console.error("Codex Usage for Obsidian:", error);
    void this.logger.write("error", error instanceof CodexUsageError ? error.code : "Unexpected plugin error.");
    new Notice(message, 10_000);
  }
}

class DashboardView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: CodexUsagePlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Codex usage"; }
  getIcon(): string { return "gauge"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("codex-usage-dashboard");
    const header = root.createDiv({ cls: "codex-usage-header" });
    header.createEl("h2", { text: "Codex usage" });
    const refresh = header.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.plugin.refresh(true));
    if (!this.plugin.data) {
      root.createEl("p", {
        text: "Install the managed helper in settings to display usage.",
        cls: "codex-usage-muted"
      });
      return;
    }
    const data = this.plugin.data;
    const quotas = root.createDiv({ cls: "codex-usage-quotas" });
    quota(quotas, "5 hour usage limit", data.usage.session, this.plugin.settings.usageDisplay);
    quota(quotas, "Weekly usage limit", data.usage.weekly, this.plugin.settings.usageDisplay);
    if (data.usage.monthly) quota(quotas, "Monthly usage limit", data.usage.monthly, this.plugin.settings.usageDisplay);

    const grid = root.createDiv({ cls: "codex-usage-grid" });
    for (const [label, value] of [
      ["Credits remaining", scalar(data.credits.remaining)],
      ["Last 30 days", money(data.cost.last30DaysCostUSD, data.cost.currencyCode)],
      ["Session cost", money(data.cost.sessionCostUSD, data.cost.currencyCode)],
      ["Last 30 days tokens", count(data.cost.last30DaysTokens)],
      ["Account", summary(data.account)],
      ["Weekly pace", summary(record(data.pace.secondary))],
      ["Updated", new Date(data.timestamp).toLocaleString()]
    ]) {
      const card = grid.createDiv({ cls: "codex-usage-card" });
      card.createEl("strong", { text: label });
      card.createDiv({ text: value || "Not available", cls: value ? "" : "codex-usage-muted" });
    }
    for (const warning of data.warnings) root.createEl("p", { text: warning, cls: "codex-usage-warning" });
    const details = root.createEl("details");
    details.createEl("summary", { text: "Advanced raw output" });
    details.createEl("pre", { text: JSON.stringify(data.raw, null, 2), cls: "codex-usage-raw" });
  }
}

class CodexUsageSettings extends PluginSettingTab {
  constructor(private owner: CodexUsagePlugin) {
    super(owner.app, owner);
  }

  display(): void {
    this.render();
  }

  private render(): void {
    const plugin = this.owner;
    this.containerEl.empty();
    new Setting(this.containerEl).setName("Helper management").setHeading();
    const helperStatus = new Setting(this.containerEl)
      .setName("Status")
      .setDesc("Checking the managed helper…");
    const helperVersion = new Setting(this.containerEl)
      .setName("Version")
      .setDesc("Checking installed and known-good versions…");
    const platform = new Setting(this.containerEl)
      .setName("Platform")
      .setDesc("Checking operating system and architecture…");
    const installPath = new Setting(this.containerEl)
      .setName("Application data location")
      .setDesc(appDataDir());
    const installAction = new Setting(this.containerEl)
      .setName("Install or update helper")
      .setDesc("Downloads the reviewed package and verifies its SHA-256 checksum before installation.")
      .addButton(button => button
        .setButtonText("Install helper")
        .setCta()
        .onClick(() => void plugin.installHelper()));
    new Setting(this.containerEl)
      .setName("Restart helper")
      .setDesc("Stops any active helper command and immediately collects fresh usage and cost data.")
      .addButton(button => button
        .setButtonText("Restart")
        .onClick(() => void plugin.restartHelper()));
    new Setting(this.containerEl)
      .setName("Reset helper")
      .setDesc("Removes the managed executable, metadata, and cached usage. A new install will be required.")
      .addButton(button => button
        .setButtonText("Reset")
        .onClick(() => void this.resetHelper()));

    void plugin.manager.status().then(status => {
      helperStatus.setDesc(status.state);
      platform.setDesc(status.target);
      helperVersion.setDesc(`Installed: ${status.installedVersion || "none"} · Known good: ${status.knownGoodVersion}`);
      installPath.setDesc(status.path);
      installAction.setName(status.state === "Missing" ? "Install helper" : "Update helper");
    }).catch(error => plugin.showError(error));

    new Setting(this.containerEl).setName("Usage refresh").setHeading();
    new Setting(this.containerEl)
      .setName("Quota display")
      .setDesc("Show the amount remaining like the codex dashboard, or the amount already used.")
      .addDropdown(dropdown => dropdown
        .addOptions({ remaining: "Remaining", used: "Used" })
        .setValue(plugin.settings.usageDisplay)
        .onChange(async value => {
          plugin.settings.usageDisplay = value as Settings["usageDisplay"];
          await plugin.saveSettings();
          this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
        }));
    new Setting(this.containerEl).setName("Last refresh").setDesc(plugin.data ? new Date(plugin.data.timestamp).toLocaleString() : "Never");
    new Setting(this.containerEl)
      .setName("Refresh now")
      .setDesc("Bypasses the cache and collects current usage and cost data.")
      .addButton(button => button
        .setButtonText("Refresh")
        .setCta()
        .onClick(() => void plugin.refresh(true)));
    new Setting(this.containerEl).setName("Cache duration").setDesc("Seconds to reuse successful data before calling the helper again.")
      .addText(text => text.setValue(String(plugin.settings.cacheTtlSeconds)).onChange(async value => {
        plugin.settings.cacheTtlSeconds = Math.max(0, Number(value) || 0);
        await plugin.saveSettings();
      }));
    new Setting(this.containerEl).setName("Automatic refresh").setDesc("Minutes between background refreshes while Obsidian is running.")
      .addText(text => text.setValue(String(plugin.settings.refreshIntervalMinutes)).onChange(async value => {
        plugin.settings.refreshIntervalMinutes = Math.max(1, Number(value) || 1);
        await plugin.saveSettings();
        plugin.scheduleRefresh();
      }));
    new Setting(this.containerEl)
      .setName("Clear cached usage")
      .setDesc("Removes the last successful snapshot. The helper installation is not affected.")
      .addButton(button => button
        .setButtonText("Clear cache")
        .onClick(() => void plugin.clearCache()));

    new Setting(this.containerEl).setName("Diagnostics").setHeading();
    new Setting(this.containerEl).setName("Log level").addDropdown(dropdown => dropdown
      .addOptions({ error: "Error", warn: "Warning", info: "Info", debug: "Debug" })
      .setValue(plugin.settings.logLevel)
      .onChange(async value => {
        plugin.settings.logLevel = value as Settings["logLevel"];
        await plugin.saveSettings();
      }));
    new Setting(this.containerEl).setName("Log file").setDesc(plugin.logger.path)
      .addButton(button => button.setButtonText("Open logs").onClick(() => void plugin.showLogs()))
      .addButton(button => button.setButtonText("Clear logs").onClick(() => void this.clearLogs()));
    new Setting(this.containerEl)
      .setName("Helper diagnostics")
      .setDesc("Runs the helper's redacted diagnostic command.")
      .addButton(button => button.setButtonText("Run diagnostics").onClick(() => void plugin.diagnostics()));
    new Setting(this.containerEl)
      .setName("Raw helper output")
      .setDesc("Shows the complete last usage and cost response for troubleshooting.")
      .addButton(button => button.setButtonText("Show raw output").onClick(() => plugin.showRaw()));
  }

  private async clearLogs(): Promise<void> {
    await this.owner.logger.clear();
    new Notice("Codex usage logs cleared.");
  }

  private async resetHelper(): Promise<void> {
    await this.owner.manager.remove();
    await this.owner.clearCache();
    this.render();
    new Notice("Managed helper removed.");
  }
}

class ConfirmModal extends Modal {
  constructor(private owner: CodexUsagePlugin, private status: HelperStatus, private confirm: () => Promise<void>) {
    super(owner.app);
  }

  onOpen(): void {
    this.titleEl.setText(`${this.status.state === "Missing" ? "Install" : "Update"} managed helper`);
    this.contentEl.createEl("p", { text: `Download and run ${this.status.target} helper ${this.status.knownGoodVersion}? Its SHA-256 checksum will be verified before installation.` });
    const install = this.contentEl.createEl("button", { text: "Continue", cls: "mod-cta" });
    install.addEventListener("click", () => { this.close(); void this.confirm(); });
    const cancel = this.contentEl.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }
}

class TextModal extends Modal {
  constructor(plugin: CodexUsagePlugin, private title: string, private text: string) {
    super(plugin.app);
  }
  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.createEl("pre", { text: this.text, cls: "codex-usage-raw" });
  }
}

function summary(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter((entry): entry is [string, string | number | boolean] =>
      ["string", "number", "boolean"].includes(typeof entry[1]))
    .map(([key, item]) => `${label(key)}: ${item}`)
    .join(" · ");
}

function quota(
  root: HTMLElement,
  title: string,
  value: Record<string, unknown>,
  display: Settings["usageDisplay"]
): void {
  const percent = [value.percent, value.usedPercent, value.usagePercent]
    .find(item => typeof item === "number");
  const shown = typeof percent === "number" && display === "remaining" ? 100 - percent : percent;
  const reset = value.resetsAt ?? value.resetAt;
  const card = root.createDiv({ cls: "codex-usage-quota" });
  const heading = card.createDiv({ cls: "codex-usage-quota-heading" });
  heading.createEl("strong", { text: title });
  heading.createSpan({ text: typeof shown === "number" ? `${shown}% ${display}` : "Not available" });
  const progress = card.createEl("progress");
  progress.max = 100;
  progress.value = typeof shown === "number" ? Math.min(100, Math.max(0, shown)) : 0;
  progress.setAttr("aria-label", `${title}: ${shown ?? 0}% ${display}`);
  if (typeof reset === "string" || typeof reset === "number") {
    card.createDiv({ text: `Resets ${formatReset(reset)}`, cls: "codex-usage-muted" });
  }
}

function dashboardMarkdown(data: UsageData, display: Settings["usageDisplay"]): string {
  const percent = (value: Record<string, unknown>) => {
    const used = [value.percent, value.usedPercent, value.usagePercent].find(item => typeof item === "number");
    return typeof used === "number" ? `${display === "remaining" ? 100 - used : used}% ${display}` : "Not available";
  };
  return `# Codex usage

> [!info] Synced snapshot
> Updated by ${data.platform} at ${new Date(data.timestamp).toLocaleString()}. On a supported desktop, install the helper for local live refreshes.

| Balance | Current value | Reset |
| --- | ---: | --- |
| 5 hour usage limit | **${percent(data.usage.session)}** | ${formatReset(data.usage.session.resetsAt ?? data.usage.session.resetAt)} |
| Weekly usage limit | **${percent(data.usage.weekly)}** | ${formatReset(data.usage.weekly.resetsAt ?? data.usage.weekly.resetAt)} |
| Credits remaining | **${scalar(data.credits.remaining) || "Not available"}** | |

## Cost

- Last 30 days: ${money(data.cost.last30DaysCostUSD, data.cost.currencyCode) || "Not available"}
- Session: ${money(data.cost.sessionCostUSD, data.cost.currencyCode) || "Not available"}
- Last 30 days tokens: ${count(data.cost.last30DaysTokens) || "Not available"}

_This file is generated by Codex Usage. Raw helper output and credentials are never synced._
`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function count(value: unknown): string {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "";
}

function money(value: unknown, currency: unknown): string {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: typeof currency === "string" ? currency : "USD"
  }).format(value);
}

function label(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, first => first.toUpperCase());
}

function formatReset(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const saved = value as Record<string, unknown>;
  return {
    cacheTtlSeconds: typeof saved.cacheTtlSeconds === "number" ? saved.cacheTtlSeconds : DEFAULT_SETTINGS.cacheTtlSeconds,
    refreshIntervalMinutes: typeof saved.refreshIntervalMinutes === "number" ? saved.refreshIntervalMinutes : DEFAULT_SETTINGS.refreshIntervalMinutes,
    logLevel: ["error", "warn", "info", "debug"].includes(String(saved.logLevel))
      ? saved.logLevel as Settings["logLevel"]
      : DEFAULT_SETTINGS.logLevel,
    usageDisplay: saved.usageDisplay === "used" ? "used" : DEFAULT_SETTINGS.usageDisplay
  };
}
