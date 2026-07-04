import { join } from "node:path";
import { ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { CodexUsageError } from "./errors";
import { HelperManager, HelperStatus } from "./helper-manager";
import { DEFAULT_SETTINGS, Settings, UsageData } from "./models";

const VIEW_TYPE = "codex-usage-dashboard";

export default class CodexUsagePlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  data: UsageData | null = null;
  manager!: HelperManager;
  private statusBar?: HTMLElement;
  private refreshTimer?: number;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & { getBasePath(): string };
    this.manager = new HelperManager(join(adapter.getBasePath(), this.app.vault.configDir, "plugins", this.manifest.id));
    this.registerView(VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.addSettingTab(new CodexUsageSettings(this));
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText("Codex —");
    this.statusBar.addEventListener("click", () => void this.openDashboard());

    const commands: Array<[string, string, () => void | Promise<void>]> = [
      ["open-dashboard", "Codex Usage: Open Dashboard", () => this.openDashboard()],
      ["refresh-usage", "Codex Usage: Refresh Usage", () => this.refresh(true)],
      ["install-helper", "Codex Usage: Install Helper", () => this.installHelper()],
      ["update-helper", "Codex Usage: Update Helper", () => this.installHelper()],
      ["restart-helper", "Codex Usage: Restart Helper", () => this.refresh(true)],
      ["run-diagnostics", "Codex Usage: Run Diagnostics", () => this.diagnostics()],
      ["show-raw-output", "Codex Usage: Show Raw Output", () => this.showRaw()],
      ["open-settings", "Codex Usage: Open Settings", () =>
        (this.app as typeof this.app & { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id)]
    ];
    for (const [id, name, callback] of commands) this.addCommand({ id, name, callback });
    this.scheduleRefresh();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async openDashboard(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
      await leaf?.setViewState({ type: VIEW_TYPE, active: true });
    }
    if (leaf) this.app.workspace.revealLeaf(leaf);
  }

  async refresh(bypassCache = false): Promise<void> {
    try {
      this.data = await this.manager.usage(this.settings.cacheTtlSeconds, bypassCache);
      this.updateStatusBar();
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

  showRaw(): void {
    new TextModal(this, "Codex Usage raw output", JSON.stringify(this.data?.raw ?? {}, null, 2)).open();
  }

  async clearCache(): Promise<void> {
    this.data = null;
    this.statusBar?.setText("Codex —");
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
  }

  private updateStatusBar(): void {
    const session = this.data?.usage.session;
    const percent = session?.percent ?? session?.usedPercent ?? session?.usagePercent;
    const reset = session?.resetsAt ?? session?.resetAt;
    this.statusBar?.setText(`Codex ${typeof percent === "number" ? `${percent}%` : "ready"}${reset ? ` · resets ${String(reset)}` : ""}`);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(
      () => void this.refresh(),
      this.settings.refreshIntervalMinutes * 60_000
    );
    this.register(() => window.clearInterval(this.refreshTimer));
  }

  private showError(error: unknown): void {
    const message = error instanceof CodexUsageError ? `${error.message}${error.details ? ` ${error.details}` : ""}` : String(error);
    console.error("Codex Usage for Obsidian:", error);
    new Notice(message, 10_000);
  }
}

class DashboardView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: CodexUsagePlugin) {
    super(leaf);
  }

  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return "Codex Usage"; }
  getIcon(): string { return "gauge"; }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.createEl("h2", { text: "Codex Usage for Obsidian" });
    if (!this.plugin.data) {
      root.createEl("p", {
        text: "Install the managed helper in settings to display usage.",
        cls: "codex-usage-muted"
      });
      return;
    }
    const data = this.plugin.data;
    const grid = root.createDiv({ cls: "codex-usage-grid" });
    for (const [label, value] of [
      ["Provider", data.provider],
      ["Session usage", summary(data.usage.session)],
      ["Weekly usage", summary(data.usage.weekly)],
      ["Credits", summary(data.credits)],
      ["Cost", summary(data.cost)],
      ["Account / status", summary({ ...data.account, ...data.status })],
      ["Last refresh", new Date(data.timestamp).toLocaleString()],
      ["Cache age", `${data.cacheAgeSeconds}s`],
      ["Active helper", `${data.adapter} ${data.helper.ourPackageVersion}`]
    ]) {
      const card = grid.createDiv({ cls: "codex-usage-card" });
      card.createEl("strong", { text: label });
      card.createEl("div", { text: value || "Not available", cls: value ? "" : "codex-usage-muted" });
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

  async display(): Promise<void> {
    const plugin = this.owner;
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Codex Usage for Obsidian" });
    const status = await plugin.manager.status();
    new Setting(this.containerEl).setName("Helper status").setDesc(status.state);
    new Setting(this.containerEl).setName("Platform").setDesc(status.target);
    new Setting(this.containerEl).setName("Installed helper version").setDesc(status.installedVersion || "Not installed");
    new Setting(this.containerEl).setName("Known-good helper version").setDesc(status.knownGoodVersion);
    new Setting(this.containerEl).setName("Helper install path").setDesc(status.path);
    new Setting(this.containerEl).setName("Last refresh").setDesc(plugin.data ? new Date(plugin.data.timestamp).toLocaleString() : "Never");
    new Setting(this.containerEl).setName("Cache TTL").setDesc("Seconds to keep successful usage data.")
      .addText(text => text.setValue(String(plugin.settings.cacheTtlSeconds)).onChange(async value => {
        plugin.settings.cacheTtlSeconds = Math.max(0, Number(value) || 0);
        await plugin.saveSettings();
      }));
    new Setting(this.containerEl).setName("Refresh interval").setDesc("Minutes between automatic refreshes.")
      .addText(text => text.setValue(String(plugin.settings.refreshIntervalMinutes)).onChange(async value => {
        plugin.settings.refreshIntervalMinutes = Math.max(1, Number(value) || 1);
        await plugin.saveSettings();
      }));
    new Setting(this.containerEl).setName("Log level").addDropdown(dropdown => dropdown
      .addOptions({ error: "Error", warn: "Warning", info: "Info", debug: "Debug" })
      .setValue(plugin.settings.logLevel)
      .onChange(async value => {
        plugin.settings.logLevel = value as Settings["logLevel"];
        await plugin.saveSettings();
      }));
    const actions = this.containerEl.createDiv({ cls: "codex-usage-actions" });
    for (const [label, action] of [
      ["Install Helper", () => plugin.installHelper()],
      ["Update Helper", () => plugin.installHelper()],
      ["Restart Helper", () => plugin.refresh(true)],
      ["Run Diagnostics", () => plugin.diagnostics()],
      ["Show Raw Output", () => plugin.showRaw()],
      ["Open Logs", () => new TextModal(plugin, "Codex Usage logs", "Runtime errors are written to the Obsidian developer console.").open()],
      ["Reset Helper", async () => { await plugin.manager.remove(); await plugin.clearCache(); this.display(); }],
      ["Clear Cache", () => plugin.clearCache()]
    ] as Array<[string, () => void | Promise<void>]>) {
      const button = actions.createEl("button", { text: label });
      button.addEventListener("click", () => void action());
    }
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
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(" · ");
}
