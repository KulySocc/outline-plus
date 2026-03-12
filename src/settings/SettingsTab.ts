import { App, PluginSettingTab, Setting } from "obsidian";
import * as Obsidian from "obsidian";
import type QuickHeadingPalettePlugin from "../main";

type PaletteLevelKey =
	| "showH1"
	| "showH2"
	| "showH3"
	| "showH4"
	| "showH5"
	| "showH6";
type FloatingOutlineLevelKey =
	| "floatingOutlineShowH1"
	| "floatingOutlineShowH2"
	| "floatingOutlineShowH3"
	| "floatingOutlineShowH4"
	| "floatingOutlineShowH5"
	| "floatingOutlineShowH6";

interface SettingGroupLike {
	addSetting(callback: (setting: Setting) => Setting): SettingGroupLike;
}

const SettingGroupCtor = (
	Obsidian as unknown as {
		SettingGroup?: new (containerEl: HTMLElement) => SettingGroupLike;
	}
).SettingGroup;

export class HeadingPaletteSettingTab extends PluginSettingTab {
	private plugin: QuickHeadingPalettePlugin;

	constructor(app: App, plugin: QuickHeadingPalettePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Heading palette levels")
			.setDesc(
				"Choose which heading levels appear in the command palette by default.",
			)
			.setHeading();

		const hiddenHeadingsSetting = new Setting(containerEl)
			.setName("Find hidden headings while searching")
			.setDesc(
				"Allow headings hidden by the palette level filters to appear once you type a search query.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.searchHiddenHeadings)
					.onChange(async (value) => {
						this.plugin.settings.searchHiddenHeadings = value;
						await this.plugin.saveSettings();
					}),
			);
		hiddenHeadingsSetting.settingEl.addClass(
			"outline-plus-settings-after-group",
		);
		const paletteLevelsContainer = this.createLevelGroup(containerEl);

		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H1",
			"Include level-1 headings in palette results.",
			"showH1",
		);
		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H2",
			"Include level-2 headings in palette results.",
			"showH2",
		);
		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H3",
			"Include level-3 headings in palette results.",
			"showH3",
		);
		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H4",
			"Include level-4 headings in palette results.",
			"showH4",
		);
		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H5",
			"Include level-5 headings in palette results.",
			"showH5",
		);
		this.addPaletteLevelToggle(
			paletteLevelsContainer,
			"Show H6",
			"Include level-6 headings in palette results.",
			"showH6",
		);

		new Setting(containerEl)
			.setName("Floating outline")
			.setDesc(
				"Adjust the persistent heading list shown next to the active note.",
			)
			.setHeading();

		new Setting(containerEl)
			.setName("Enable floating outline")
			.setDesc("Show a persistent heading list for the active note.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.floatingOutlineEnabled)
					.onChange(async (value) => {
						this.plugin.settings.floatingOutlineEnabled = value;
						await this.plugin.saveSettings();
						this.plugin.refreshFloatingOutline();
						this.display();
					}),
			);

		if (!this.plugin.settings.floatingOutlineEnabled) {
			return;
		}

		new Setting(containerEl)
			.setName("Position")
			.setDesc("Choose where the floating outline appears.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("left", "Left")
					.addOption("right", "Right")
					.setValue(this.plugin.settings.floatingOutlineSide)
					.onChange(async (value) => {
						this.plugin.settings.floatingOutlineSide =
							value === "left" ? "left" : "right";
						await this.plugin.saveSettings();
						this.plugin.refreshFloatingOutline();
					}),
			);

		new Setting(containerEl)
			.setName("Alignment")
			.setDesc(
				"Choose whether the floating outline aligns to the content or to the window edge.",
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("to-content", "To content")
					.addOption("to-window", "To window")
					.setValue(this.plugin.settings.floatingOutlineAlignment)
					.onChange(async (value) => {
						this.plugin.settings.floatingOutlineAlignment =
							value === "to-content" ? "to-content" : "to-window";
						await this.plugin.saveSettings();
						this.plugin.refreshFloatingOutline();
					}),
			);

		new Setting(containerEl)
			.setName("Opacity")
			.setDesc("Set floating outline opacity.")
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 10)
					.setDynamicTooltip()
					.setValue(this.plugin.settings.floatingOutlineOpacity)
					.onChange(async (value) => {
						this.plugin.settings.floatingOutlineOpacity = value;
						await this.plugin.saveSettings();
						this.plugin.refreshFloatingOutline();
					}),
			);

		const floatingLevelsContainer = this.createLevelGroup(containerEl);

		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H1",
			"Include level-1 headings in floating outline results.",
			"floatingOutlineShowH1",
		);
		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H2",
			"Include level-2 headings in floating outline results.",
			"floatingOutlineShowH2",
		);
		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H3",
			"Include level-3 headings in floating outline results.",
			"floatingOutlineShowH3",
		);
		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H4",
			"Include level-4 headings in floating outline results.",
			"floatingOutlineShowH4",
		);
		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H5",
			"Include level-5 headings in floating outline results.",
			"floatingOutlineShowH5",
		);
		this.addFloatingLevelToggle(
			floatingLevelsContainer,
			"Show H6",
			"Include level-6 headings in floating outline results.",
			"floatingOutlineShowH6",
		);
	}

	private createLevelGroup(containerEl: HTMLElement): SettingGroupLike {
		if (SettingGroupCtor) {
			return new SettingGroupCtor(containerEl);
		}

		const fallbackEl = containerEl.createDiv({ cls: "setting-item-group" });
		return {
			addSetting: (callback) => {
				callback(new Setting(fallbackEl));
				return this.createLevelGroupFromElement(fallbackEl);
			},
		};
	}

	private createLevelGroupFromElement(
		containerEl: HTMLElement,
	): SettingGroupLike {
		return {
			addSetting: (callback) => {
				callback(new Setting(containerEl));
				return this.createLevelGroupFromElement(containerEl);
			},
		};
	}

	private addPaletteLevelToggle(
		containerEl: SettingGroupLike,
		name: string,
		description: string,
		key: PaletteLevelKey,
	): void {
		containerEl.addSetting((setting) =>
			setting
				.setName(name)
				.setDesc(description)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[key])
						.onChange(async (value) => {
							this.plugin.settings[key] = value;
							await this.plugin.saveSettings();
						}),
				),
		);
	}

	private addFloatingLevelToggle(
		containerEl: SettingGroupLike,
		name: string,
		description: string,
		key: FloatingOutlineLevelKey,
	): void {
		containerEl.addSetting((setting) =>
			setting
				.setName(name)
				.setDesc(description)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings[key])
						.onChange(async (value) => {
							this.plugin.settings[key] = value;
							await this.plugin.saveSettings();
							this.plugin.refreshFloatingOutline();
						}),
				),
		);
	}
}
