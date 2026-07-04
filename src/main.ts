import { ItemView, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, Settings, UsageData } from "./models";

const VIEW_TYPE = "codex-usage-dashboard";

export default class CodexUsagePlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  data: UsageData | null = null;
  private statusBar?: HTMLElement;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.registerView(VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.addSettingTab(new CodexUsageSettings(this));
    this.statusBar = this.addStatusBarItem();
    this.statusBar.setText("Codex —");
    this.statusBar.addEventListener("click", () => void this.openDashboard());

    const commands: Array<[string, string, () => void | Promise<void>]> = [
      ["open-dashboard", "Codex Usage: Open Dashboard", () => this.openDashboard()],
      ["refresh-usage", "Codex Usage: Refresh Usage", () => this.refresh(true)],
      ["install-helper", "Codex Usage: Install Helper", () => this.notReady("Install Helper")],
      ["update-helper", "Codex Usage: Update Helper", () => this.notReady("Update Helper")],
      ["restart-helper", "Codex Usage: Restart Helper", () => this.notReady("Restart Helper")],
      ["run-diagnostics", "Codex Usage: Run Diagnostics", () => this.notReady("Run Diagnostics")],
      ["show-raw-output", "Codex Usage: Show Raw Output", () => this.openDashboard()],
      ["open-settings", "Codex Usage: Open Settings", () =>
        (this.app as typeof this.app & { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id)]
    ];
    for (const [id, name, callback] of commands) this.addCommand({ id, name, callback });
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

  async refresh(_bypassCache = false): Promise<void> {
    new Notice("Install a managed helper before refreshing usage.");
  }

  private notReady(action: string): void {
    new Notice(`${action} will be available after helper management is configured.`);
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
    root.createEl("pre", {
      text: JSON.stringify(this.plugin.data, null, 2),
      cls: "codex-usage-raw"
    });
  }
}

class CodexUsageSettings extends PluginSettingTab {
  constructor(private owner: CodexUsagePlugin) {
    super(owner.app, owner);
  }

  display(): void {
    const plugin = this.owner;
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Codex Usage for Obsidian" });
    new Setting(this.containerEl).setName("Helper status").setDesc("Missing");
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
  }
}
