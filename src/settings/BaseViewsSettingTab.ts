import { App, PluginSettingTab, Setting } from "obsidian";
import TaskNotesPlugin from "../main";

// Settings tab focused on Base Views-only features.
export class BaseViewsSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: TaskNotesPlugin) {
		super(app, plugin);
	}

	private t(
		key: string,
		fallback: string,
		params?: Record<string, string | number>
	): string {
		const translated = this.plugin.i18n?.translate(key, params);
		if (translated && translated !== key) {
			return translated;
		}
		return fallback;
	}

	private getLanguageOptionLabel(languageCode: string): string {
		const key = `common.languages.${languageCode}`;
		const translated = this.plugin.i18n?.translate(key);
		if (translated && translated !== key) {
			return translated;
		}
		return this.plugin.i18n?.getNativeLanguageName(languageCode) ?? languageCode;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h3", {
			text: this.t(
				"settings.integrations.basesIntegration.featureToggles.header",
				"Feature switches"
			),
		});

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.enable.name",
					"Enable view list sidebar"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.enable.description",
					"Show a clickable list of views in base files."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBasesViewListSidebar !== false)
					.onChange(async (value) => {
						this.plugin.settings.enableBasesViewListSidebar = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.featureToggles.tableViewCustom.name",
					"Enable Table View (Custom)"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.featureToggles.tableViewCustom.description",
					"Register Table View (Custom) in Bases."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBasesCustomTableView !== false)
					.onChange(async (value) => {
						this.plugin.settings.enableBasesCustomTableView = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.featureToggles.taskListViewCustom.name",
					"Enable Task List View (Custom)"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.featureToggles.taskListViewCustom.description",
					"Register Task List View (Custom) in Bases."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBasesTaskListCustomView !== false)
					.onChange(async (value) => {
						this.plugin.settings.enableBasesTaskListCustomView = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", {
			text: this.t("settings.general.uiLanguage.header", "Interface language"),
		});

		new Setting(containerEl)
			.setName(this.t("settings.general.uiLanguage.dropdown.name", "UI language"))
			.setDesc(
				this.t(
					"settings.general.uiLanguage.dropdown.description",
					"Select the language used for plugin interface text"
				)
			)
			.addDropdown((dropdown) => {
				dropdown.addOption(
					"system",
					this.t("common.systemDefault", "System default")
				);

				const availableLocales = this.plugin.i18n?.getAvailableLocales() ?? ["en", "ja"];
				for (const locale of [...availableLocales].sort()) {
					dropdown.addOption(locale, this.getLanguageOptionLabel(locale));
				}

				dropdown
					.setValue(this.plugin.settings.uiLanguage ?? "system")
					.onChange(async (value) => {
						this.plugin.settings.uiLanguage = value;
						this.plugin.i18n?.setLocale(value);
						await this.plugin.saveSettings();
						this.display();
					});
			});

		containerEl.createEl("h3", {
			text: this.t("settings.integrations.basesIntegration.viewListSidebar.title", "Views"),
		});

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.dropdownMode.name",
					"Native view dropdown mode"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.dropdownMode.description",
					"Choose whether to hide the native Bases view dropdown."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"list-only",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.dropdownMode.options.listOnly",
							"List only"
						)
					)
					.addOption(
						"combined",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.dropdownMode.options.combined",
							"Combined"
						)
					)
					.setValue(this.plugin.settings.basesViewListDropdownMode)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListDropdownMode = value as "list-only" | "combined";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.placement.name",
					"View list placement"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.placement.description",
					"Choose where to place the view list in base files."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"left",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.placement.options.left",
							"Left"
						)
					)
					.addOption(
						"top",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.placement.options.top",
							"Top"
						)
					)
					.addOption(
						"none",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.placement.options.none",
							"None"
						)
					)
					.setValue(this.plugin.settings.basesViewListPlacement)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListPlacement = value as "left" | "top" | "none";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.sidePanePlacement.name",
					"View list placement in side pane"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.sidePanePlacement.description",
					"Choose where to place the view list in side pane."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"left",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.sidePanePlacement.options.left",
							"Left"
						)
					)
					.addOption(
						"top",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.sidePanePlacement.options.top",
							"Top"
						)
					)
					.addOption(
						"none",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.sidePanePlacement.options.none",
							"None"
						)
					)
					.setValue(this.plugin.settings.basesViewListSidePanePlacement)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListSidePanePlacement =
							value as "left" | "top" | "none";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.fontSize.name",
					"View list font size"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.fontSize.description",
					"Adjust the font size for view names and property text."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"m",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.fontSize.options.m",
							"Default"
						)
					)
					.addOption(
						"s",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.fontSize.options.s",
							"Small"
						)
					)
					.addOption(
						"xs",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.fontSize.options.xs",
							"Very small"
						)
					)
					.setValue(this.plugin.settings.basesViewListFontSize)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListFontSize = value as "m" | "s" | "xs";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.property.show.name",
					"Show view property"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.property.show.description",
					"Show a secondary property line under each view name."
				)
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.basesViewListShowProperty).onChange(async (value) => {
					this.plugin.settings.basesViewListShowProperty = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.property.key.name",
					"Default property key to show"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.property.key.description",
					"Default property key shown under each view."
				)
			)
			.addText((text) =>
				text
					.setPlaceholder("description")
					.setValue(this.plugin.settings.basesViewListPropertyKey ?? "")
					.onChange(async (value) => {
						this.plugin.settings.basesViewListPropertyKey = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.nativeToolbar.name",
					"Show native Bases toolbar"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.nativeToolbar.description",
					"Show native Bases header and toolbar while the view list is visible."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.basesViewListShowNativeToolbar)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListShowNativeToolbar = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.showIcons.name",
					"Show view icons"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.showIcons.description",
					"Show a type icon before each view name."
				)
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.basesViewListShowIcons).onChange(async (value) => {
					this.plugin.settings.basesViewListShowIcons = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.topOverflow.name",
					"Top list overflow"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.topOverflow.description",
					"When list is displayed on top, choose wrap or scroll."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"wrap",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.topOverflow.options.wrap",
							"Wrap"
						)
					)
					.addOption(
						"scroll",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.topOverflow.options.scroll",
							"Scroll"
						)
					)
					.setValue(this.plugin.settings.basesViewListTopOverflowMode)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListTopOverflowMode = value as "wrap" | "scroll";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.narrowBehavior.name",
					"Behavior on narrow pane"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.narrowBehavior.description",
					"How to handle the view list on narrow panes."
				)
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption(
						"none",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.narrowBehavior.options.none",
							"None"
						)
					)
					.addOption(
						"top",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.narrowBehavior.options.top",
							"Top"
						)
					)
					.addOption(
						"hide",
						this.t(
							"settings.integrations.basesIntegration.viewListSidebar.narrowBehavior.options.hide",
							"Hide"
						)
					)
					.setValue(this.plugin.settings.basesViewListNarrowBehavior)
					.onChange(async (value) => {
						this.plugin.settings.basesViewListNarrowBehavior =
							value as "none" | "top" | "hide";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.narrowThreshold.name",
					"Narrow width threshold (px)"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.viewListSidebar.narrowThreshold.description",
					"Pane width threshold in pixels."
				)
			)
			.addText((text) =>
				text
					.setPlaceholder("800")
					.setValue(String(this.plugin.settings.basesViewListNarrowThresholdPx ?? 800))
					.onChange(async (value) => {
						const parsed = Number(value);
						if (Number.isFinite(parsed) && parsed > 0) {
							this.plugin.settings.basesViewListNarrowThresholdPx = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		containerEl.createEl("h3", {
			text: this.t("settings.integrations.basesIntegration.customViews.header", "Custom views"),
		});

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.customViews.showIconicIcon.name",
					"Show Iconic icon in Table View (Custom)"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.customViews.showIconicIcon.description",
					"Display Iconic file icon before file name when available."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.customTableShowIconicIconInNameColumn)
					.onChange(async (value) => {
						this.plugin.settings.customTableShowIconicIconInNameColumn = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(
				this.t(
					"settings.integrations.basesIntegration.customViews.showGroupingPropertyName.name",
					"Show grouping property name in Table View (Custom)"
				)
			)
			.setDesc(
				this.t(
					"settings.integrations.basesIntegration.customViews.showGroupingPropertyName.description",
					"Display group headers as \"property: value\"."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.customTableShowGroupingPropertyName)
					.onChange(async (value) => {
						this.plugin.settings.customTableShowGroupingPropertyName = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
