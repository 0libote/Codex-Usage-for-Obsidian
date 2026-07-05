import { join } from "node:path";
import { ItemView, Modal, Notice, normalizePath, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { appDataDir } from "./app-data";
import { CodexUsageError } from "./errors";
import { HelperManager, HelperStatus, ProviderConfigInput, ProviderStatus } from "./helper-manager";
import { HistorySample, MetricKey } from "./history";
import { Logger } from "./logging";
import { DashboardSection, DEFAULT_SETTINGS, Settings, UsageData } from "./models";
import { providerFields, providerGuide } from "./provider-setup";

const VIEW_TYPE = "codex-usage-dashboard";

export default class CodexUsagePlugin extends Plugin {
  settings: Settings = DEFAULT_SETTINGS;
  data: UsageData | null = null;
  history: HistorySample[] = [];
  manager!: HelperManager;
  logger!: Logger;
  private refreshTimer?: number;

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData() as unknown);
    const dataDir = appDataDir();
    this.logger = new Logger(join(dataDir, "logs", "plugin.log"), this.settings.logLevel);
    this.manager = new HelperManager(dataDir, undefined, this.logger);
    this.registerView(VIEW_TYPE, leaf => new DashboardView(leaf, this));
    this.addSettingTab(new CodexUsageSettings(this));
    this.addRibbonIcon("gauge", "Open codex usage", () => void this.openDashboard());

    const commands: Array<[string, string, () => void | Promise<void>]> = [
      ["open-dashboard", "Codex Usage: Open Dashboard", () => this.openDashboard()],
      ["refresh-usage", "Codex Usage: Refresh Usage", () => this.refresh(true)],
      ["install-helper", "Codex Usage: Install Helper", () => this.installHelper()],
      ["update-helper", "Codex Usage: Update Helper", () => this.installHelper()],
      ["restart-helper", "Codex Usage: Restart Helper", () => this.restartHelper()],
      ["run-diagnostics", "Codex Usage: Run Diagnostics", () => this.diagnostics()],
      ["show-raw-output", "Codex Usage: Show Raw Output", () => this.showRaw()],
      ["open-settings", "Codex Usage: Open Settings", () => this.openSettings()]
    ];
    for (const [id, name, callback] of commands) this.addCommand({ id, name, callback });
    this.data = await this.manager.cached() ?? null;
    this.history = await this.manager.history();
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

  openSettings(): void {
    (this.app as typeof this.app & { setting: { openTabById(id: string): void } }).setting.openTabById(this.manifest.id);
  }

  async refresh(bypassCache = false): Promise<void> {
    try {
      this.data = await this.manager.usage(this.settings.cacheTtlSeconds, bypassCache);
      this.history = await this.manager.history();
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
    this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
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
    const title = header.createDiv();
    title.createEl("h2", { text: "Codex usage" });
    title.createDiv({ text: "Plan limits and local usage", cls: "codex-usage-muted" });
    const actions = header.createDiv({ cls: "codex-usage-actions" });
    const customize = actions.createEl("button", { text: "Customize" });
    customize.addEventListener("click", () => this.plugin.openSettings());
    const refresh = actions.createEl("button", { text: "Refresh", cls: "mod-cta" });
    refresh.addEventListener("click", () => void this.plugin.refresh(true));
    if (!this.plugin.data) {
      root.createEl("p", {
        text: "Install the managed helper in settings to display usage.",
        cls: "codex-usage-muted"
      });
      return;
    }
    const data = this.plugin.data;
    root.createDiv({
      text: `Updated ${new Date(data.timestamp).toLocaleString()} · ${data.provider}`,
      cls: "codex-usage-updated"
    });
    for (const warning of data.warnings) {
      root.createDiv({ text: warning, cls: "codex-usage-notice" });
    }

    const quotas = root.createDiv({ cls: "codex-usage-quotas" });
    quota(quotas, "5 hour usage limit", data.usage.session, this.plugin.settings.usageDisplay,
      () => this.openMetric("sessionPercent", "5 hour usage", "%", "Codex provider quota", "Used percentage reported by the helper for the current five-hour window."));
    quota(quotas, "Weekly usage limit", data.usage.weekly, this.plugin.settings.usageDisplay,
      () => this.openMetric("weeklyPercent", "Weekly usage", "%", "Codex provider quota", "Used percentage reported by the helper for the current weekly window."));
    if (data.usage.monthly) {
      quota(quotas, "Monthly usage limit", data.usage.monthly, this.plugin.settings.usageDisplay,
        () => this.openMetric("monthlyPercent", "Monthly usage", "%", "Codex provider quota", "Used percentage reported by the helper for the current monthly window."));
    }

    const sections = new Set(this.plugin.settings.dashboardSections);
    const grid = root.createDiv({ cls: "codex-usage-grid" });
    if (sections.has("credits")) {
      metric(grid, "Credits remaining", scalar(data.credits.remaining), "Beyond plan limits",
        () => this.openMetric("credits", "Credits remaining", "", "Codex provider response", "Remaining credits beyond plan limits."));
    }
    if (sections.has("cost")) {
      metric(grid, "Last 30 days", money(data.cost.last30DaysCostUSD, data.cost.currencyCode), "Estimated local cost",
        () => this.openMetric("cost30Days", "30-day cost", "currency", "Local Codex session logs", "Estimated cost of usage found in the last 30 days."));
      metric(grid, "Current session", money(data.cost.sessionCostUSD, data.cost.currencyCode), "Estimated local cost",
        () => this.openMetric("sessionCost", "Session cost", "currency", "Local Codex session logs", "Estimated cost accumulated in the current session."));
    }
    if (sections.has("tokens")) {
      const tokens = tokenUsage(data.cost);
      metric(
        grid,
        "Lifetime tokens",
        count(tokens.processed),
        tokens.processed === undefined
          ? "Local Codex history"
          : `${count(tokens.nonCached)} non-cached · ${count(tokens.cached)} cache reads`,
        () => this.openMetric("tokens", "Lifetime tokens", "count", "Local Codex session logs", "Input and output tokens processed. Cache-read tokens are included in processed tokens.")
      );
      metric(grid, "Input tokens", count(tokens.input), "Lifetime local history",
        () => this.openMetric("inputTokens", "Input tokens", "count", "Local Codex session logs", "Tokens sent to models across the local history."));
      metric(grid, "Output tokens", count(tokens.output), "Lifetime local history",
        () => this.openMetric("outputTokens", "Output tokens", "count", "Local Codex session logs", "Tokens generated by models across the local history."));
      metric(grid, "Cache hit rate", percent(tokens.cacheRate), `${count(tokens.cached)} cached tokens`,
        () => this.openMetric("cacheRate", "Cache hit rate", "%", "Local Codex session logs", "Cache-read tokens divided by all processed tokens."));
    }
    if (sections.has("account")) {
      metric(grid, "Account", accountSummary(data.account), scalar(data.account.planType ?? data.account.plan) || "Local account");
      metric(grid, "Provider status", scalar(data.status.status ?? data.status.message), "Last helper response");
    }
    if (sections.has("pace")) {
      const pace = record(data.pace.secondary);
      metric(grid, "Weekly pace", scalar(pace.summary), pace.willLastToReset === true ? "On track" : "Projected usage");
    }
    if (!grid.childElementCount) grid.remove();
    if (sections.has("technical")) technicalDetails(root, data);
  }

  private openMetric(key: MetricKey, title: string, unit: MetricUnit, source: string, makeup: string): void {
    new MetricModal(this.plugin, { key, title, unit, source, makeup }).open();
  }
}

class CodexUsageSettings extends PluginSettingTab {
  private selectedProvider = "opencode";

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

    new Setting(this.containerEl).setName("Providers").setHeading();
    const providerArea = this.containerEl.createDiv();
    void this.renderProviders(providerArea);

    new Setting(this.containerEl).setName("Dashboard").setHeading();
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
    const dashboardOptions: Array<[DashboardSection, string, string]> = [
      ["credits", "Credits", "Show credits remaining beyond plan limits."],
      ["cost", "Cost estimates", "Show session and 30-day estimated cost."],
      ["tokens", "Token usage", "Show token totals from local Codex history."],
      ["pace", "Weekly pace", "Show whether current usage is likely to last until reset."],
      ["account", "Account identity", "Show the local account email and login method."],
      ["technical", "Technical details", "Show helper metadata, every normalized field, and raw output."]
    ];
    for (const [section, name, description] of dashboardOptions) {
      new Setting(this.containerEl)
        .setName(name)
        .setDesc(description)
        .addToggle(toggle => toggle
          .setValue(plugin.settings.dashboardSections.includes(section))
          .onChange(async enabled => {
            plugin.settings.dashboardSections = enabled
              ? [...plugin.settings.dashboardSections, section]
              : plugin.settings.dashboardSections.filter(item => item !== section);
            await plugin.saveSettings();
            this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach(leaf => (leaf.view as DashboardView).render());
          }));
    }

    new Setting(this.containerEl).setName("Usage refresh").setHeading();
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

  private async renderProviders(container: HTMLElement): Promise<void> {
    container.empty();
    let providers: ProviderStatus[];
    try {
      providers = await this.owner.manager.providers();
    } catch (error) {
      container.createEl("p", { text: "Install the managed helper to configure providers.", cls: "codex-usage-muted" });
      await this.owner.logger.write("debug", `Provider settings unavailable: ${String(error)}`);
      return;
    }
    const selected = providers.find(item => item.provider === this.selectedProvider) ?? providers[0];
    if (!selected) {
      container.createEl("p", { text: "No providers are available.", cls: "codex-usage-muted" });
      return;
    }
    this.selectedProvider = selected.provider;

    new Setting(container)
      .setName("Provider")
      .setDesc("Choose a provider. Extra fields appear only when required.")
      .addDropdown(dropdown => {
        for (const provider of providers) dropdown.addOption(provider.provider, provider.displayName);
        dropdown.setValue(selected.provider).onChange(value => {
          this.selectedProvider = value;
          void this.renderProviders(container);
        });
      });
    new Setting(container)
      .setName(selected.displayName)
      .setDesc(`${providerGuide(selected.provider)}${selected.enabled ? " Currently enabled." : ""}`);

    const fields = providerFields(selected.provider);
    if (!fields.length || selected.enabled) {
      new Setting(container)
        .setName(selected.enabled ? "Enabled" : "Enable provider")
        .setDesc("Stored in the helper configuration on this device.")
        .addToggle(toggle => toggle.setValue(selected.enabled).onChange(async enabled => {
          try {
            await this.owner.manager.setProviderEnabled(selected.provider, enabled);
            await this.renderProviders(container);
          } catch (error) {
            this.owner.showError(error);
          }
        }));
    }

    const input: ProviderConfigInput = {};
    for (const field of fields) {
      const setting = new Setting(container).setName(field.name).setDesc(field.description);
      const bind = (component: { inputEl: HTMLInputElement | HTMLTextAreaElement; setPlaceholder(value: string): unknown; onChange(callback: (value: string) => void): unknown }) => {
        if (field.secret) component.inputEl.setAttribute("type", "password");
        if (field.multiline && component.inputEl instanceof HTMLTextAreaElement) component.inputEl.rows = 3;
        component.setPlaceholder(field.placeholder);
        component.onChange(value => { input[field.key] = value; });
      };
      if (field.multiline) setting.addTextArea(bind);
      else setting.addText(bind);
    }
    if (fields.length) new Setting(container)
        .setName("Save and enable")
        .setDesc("Nothing entered here is stored in the vault or synced.")
        .addButton(button => button.setButtonText("Save and enable").setCta().onClick(async () => {
          try {
            await this.owner.manager.configureProvider(selected.provider, input);
            new Notice(`${selected.displayName} setup saved.`);
            await this.renderProviders(container);
          } catch (error) {
            this.owner.showError(error);
          }
        }));
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

type MetricUnit = "" | "%" | "count" | "currency";
type MetricDetails = {
  key: MetricKey;
  title: string;
  unit: MetricUnit;
  source: string;
  makeup: string;
};

class MetricModal extends Modal {
  constructor(private plugin: CodexUsagePlugin, private metricDetails: MetricDetails) {
    super(plugin.app);
  }

  onOpen(): void {
    this.titleEl.setText(this.metricDetails.title);
    const controls = this.contentEl.createDiv({ cls: "codex-usage-chart-controls" });
    controls.createSpan({ text: "History" });
    const range = controls.createEl("select", { attr: { "aria-label": "History range" } });
    for (const [value, label] of [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["0", "All time"]]) {
      range.createEl("option", { value, text: label });
    }
    range.value = "30";
    const chart = this.contentEl.createDiv();
    const render = () => this.renderChart(chart, Number(range.value));
    range.addEventListener("change", render);
    render();

    const details = this.contentEl.createEl("dl", { cls: "codex-usage-metadata" });
    for (const [name, value] of [["Source", this.metricDetails.source], ["Made up of", this.metricDetails.makeup]]) {
      details.createEl("dt", { text: name });
      details.createEl("dd", { text: value });
    }
  }

  private renderChart(root: HTMLElement, days: number): void {
    root.empty();
    const cutoff = days ? Date.now() - days * 86_400_000 : 0;
    const points = this.plugin.history.flatMap(sample => {
      const value = sample.values[this.metricDetails.key];
      const timestamp = new Date(sample.timestamp).getTime();
      return value === undefined || !Number.isFinite(timestamp) || timestamp < cutoff ? [] : [{ timestamp, value }];
    });
    if (!points.length) {
      root.createEl("p", { text: "History will appear after successful refreshes.", cls: "codex-usage-muted" });
      return;
    }
    const first = points[0]!;
    const last = points.at(-1)!;
    root.createDiv({
      text: `${formatMetric(last.value, this.metricDetails.unit, this.plugin.data)} · tracked since ${new Date(first.timestamp).toLocaleDateString()}`,
      cls: "codex-usage-chart-value"
    });
    if (points.length < 2) {
      root.createEl("p", { text: "One point recorded. Refresh later to build the graph.", cls: "codex-usage-muted" });
      return;
    }
    const width = 640;
    const height = 220;
    const padding = 12;
    const min = Math.min(...points.map(point => point.value));
    const max = Math.max(...points.map(point => point.value));
    const timeSpan = last.timestamp - first.timestamp || 1;
    const valueSpan = max - min || 1;
    const coordinates = points.map(point => [
      padding + (point.timestamp - first.timestamp) / timeSpan * (width - padding * 2),
      height - padding - (point.value - min) / valueSpan * (height - padding * 2)
    ]);
    const svg = root.createSvg("svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "codex-usage-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${this.metricDetails.title} from ${formatMetric(min, this.metricDetails.unit, this.plugin.data)} to ${formatMetric(max, this.metricDetails.unit, this.plugin.data)}`);
    const line = svg.createSvg("polyline");
    line.setAttribute("points", coordinates.map(point => point.join(",")).join(" "));
    root.createDiv({
      text: `${new Date(first.timestamp).toLocaleDateString()} · range ${formatMetric(min, this.metricDetails.unit, this.plugin.data)}–${formatMetric(max, this.metricDetails.unit, this.plugin.data)} · ${new Date(last.timestamp).toLocaleDateString()}`,
      cls: "codex-usage-chart-axis"
    });
  }
}

function quota(
  root: HTMLElement,
  title: string,
  value: Record<string, unknown>,
  display: Settings["usageDisplay"],
  open?: () => void
): void {
  const percent = [value.percent, value.usedPercent, value.usagePercent]
    .find(item => typeof item === "number");
  const shown = typeof percent === "number" && display === "remaining" ? 100 - percent : percent;
  const reset = value.resetsAt ?? value.resetAt;
  const card = root.createDiv({
    cls: `codex-usage-quota${display === "remaining" && typeof shown === "number" && shown <= 10 ? " is-low" : ""}`
  });
  const heading = card.createDiv({ cls: "codex-usage-quota-heading" });
  heading.createEl("strong", { text: title });
  const amount = heading.createDiv();
  amount.createSpan({ text: typeof shown === "number" ? `${shown}%` : "—", cls: "codex-usage-quota-value" });
  amount.createSpan({ text: ` ${display}`, cls: "codex-usage-muted" });
  const progress = card.createEl("progress");
  progress.max = 100;
  progress.value = typeof shown === "number" ? Math.min(100, Math.max(0, shown)) : 0;
  progress.setAttr("aria-label", `${title}: ${shown ?? 0}% ${display}`);
  if (typeof reset === "string" || typeof reset === "number") {
    card.createDiv({ text: `Resets ${formatReset(reset)}`, cls: "codex-usage-muted" });
  }
  if (open) makeInteractive(card, open);
}

function metric(root: HTMLElement, title: string, value: string, note: string, open?: () => void): void {
  if (!value) return;
  const card = root.createDiv({ cls: "codex-usage-card" });
  card.createDiv({ text: title, cls: "codex-usage-card-title" });
  card.createDiv({ text: value, cls: "codex-usage-card-value" });
  card.createDiv({ text: note, cls: "codex-usage-card-note" });
  if (open) makeInteractive(card, open);
}

function makeInteractive(card: HTMLElement, open: () => void): void {
  card.addClass("is-clickable");
  card.setAttr("role", "button");
  card.setAttr("tabindex", "0");
  card.setAttr("aria-label", `${card.textContent}. Open history`);
  card.addEventListener("click", open);
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
  });
}

function accountSummary(account: Record<string, unknown>): string {
  const email = scalar(account.accountEmail);
  const plan = scalar(account.loginMethod);
  return [email, plan].filter(Boolean).join(" · ");
}

function technicalDetails(root: HTMLElement, data: UsageData): void {
  const details = root.createEl("details", { cls: "codex-usage-details" });
  details.createEl("summary", { text: "Technical details and raw data" });
  const table = details.createEl("dl", { cls: "codex-usage-metadata" });
  for (const [name, value] of [
    ["Platform", `${data.platform} ${data.architecture}`],
    ["Adapter", data.adapter],
    ["Cache age", `${data.cacheAgeSeconds}s`],
    ["Helper", data.helper.ourPackageVersion],
    ["Capabilities", data.capabilities.join(", ")]
  ]) {
    table.createEl("dt", { text: name });
    table.createEl("dd", { text: value });
  }
  for (const [name, value] of Object.entries({
    Usage: data.usage,
    Credits: data.credits,
    Cost: data.cost,
    Pace: data.pace,
    Status: data.status,
    Account: data.account,
    "Raw helper output": data.raw
  })) {
    const section = details.createEl("details");
    section.createEl("summary", { text: name });
    section.createEl("pre", { text: JSON.stringify(value, null, 2), cls: "codex-usage-raw" });
  }
}

function dashboardMarkdown(data: UsageData, display: Settings["usageDisplay"]): string {
  const percent = (value: Record<string, unknown>) => {
    const used = [value.percent, value.usedPercent, value.usagePercent].find(item => typeof item === "number");
    return typeof used === "number" ? `${display === "remaining" ? 100 - used : used}% ${display}` : "Not available";
  };
  const tokens = tokenUsage(data.cost);
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
- Non-cached tokens: ${count(tokens.nonCached) || "Not available"}
- Tokens processed: ${count(tokens.processed) || "Not available"} (${count(tokens.cached) || "0"} cache reads)

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

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function tokenUsage(cost: Record<string, unknown>): {
  nonCached: number | undefined;
  processed: number | undefined;
  cached: number;
  input: number | undefined;
  output: number | undefined;
  cacheRate: number | undefined;
} {
  const totals = record(cost.totals);
  const processed = number(totals.totalTokens) ?? number(cost.last30DaysTokens);
  const cached = number(totals.cacheReadTokens) ?? 0;
  const input = number(totals.inputTokens) ?? number(cost.inputTokens);
  const output = number(totals.outputTokens) ?? number(cost.outputTokens);
  return {
    processed,
    cached,
    input,
    output,
    nonCached: processed === undefined ? undefined : Math.max(0, processed - cached),
    cacheRate: processed ? cached / processed * 100 : undefined
  };
}

function percent(value: number | undefined): string {
  return value === undefined ? "" : `${value.toFixed(1)}%`;
}

function money(value: unknown, currency: unknown): string {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: typeof currency === "string" ? currency : "USD"
  }).format(value);
}

function formatMetric(value: number, unit: MetricUnit, data: UsageData | null): string {
  if (unit === "count") return count(value);
  if (unit === "%") return percent(value);
  if (unit === "currency") return money(value, data?.cost.currencyCode) || String(value);
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatReset(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function parseSettings(value: unknown): Settings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SETTINGS };
  const saved = value as Record<string, unknown>;
  const sections = Array.isArray(saved.dashboardSections)
    ? saved.dashboardSections.filter((item): item is DashboardSection =>
      ["credits", "cost", "tokens", "account", "pace", "technical"].includes(String(item)))
    : DEFAULT_SETTINGS.dashboardSections;
  return {
    cacheTtlSeconds: typeof saved.cacheTtlSeconds === "number" ? saved.cacheTtlSeconds : DEFAULT_SETTINGS.cacheTtlSeconds,
    refreshIntervalMinutes: typeof saved.refreshIntervalMinutes === "number" ? saved.refreshIntervalMinutes : DEFAULT_SETTINGS.refreshIntervalMinutes,
    logLevel: ["error", "warn", "info", "debug"].includes(String(saved.logLevel))
      ? saved.logLevel as Settings["logLevel"]
      : DEFAULT_SETTINGS.logLevel,
    usageDisplay: saved.usageDisplay === "used" ? "used" : DEFAULT_SETTINGS.usageDisplay,
    dashboardSections: [...new Set(sections)]
  };
}
