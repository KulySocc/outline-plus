import { App, PluginSettingTab, Setting } from "obsidian";
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

export class HeadingPaletteSettingTab extends PluginSettingTab {
	private plugin: QuickHeadingPalettePlugin;

	constructor(app: App, plugin: QuickHeadingPalettePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Heading palette levels").setHeading();

		this.addPaletteLevelToggle(
			containerEl,
			"Show H1",
			"Include level-1 headings in palette results.",
			"showH1",
		);
		this.addPaletteLevelToggle(
			containerEl,
			"Show H2",
			"Include level-2 headings in palette results.",
			"showH2",
		);
		this.addPaletteLevelToggle(
			containerEl,
			"Show H3",
			"Include level-3 headings in palette results.",
			"showH3",
		);
		this.addPaletteLevelToggle(
			containerEl,
			"Show H4",
			"Include level-4 headings in palette results.",
			"showH4",
		);
		this.addPaletteLevelToggle(
			containerEl,
			"Show H5",
			"Include level-5 headings in palette results.",
			"showH5",
		);
		this.addPaletteLevelToggle(
			containerEl,
			"Show H6",
			"Include level-6 headings in palette results.",
			"showH6",
		);

		new Setting(containerEl).setName("Floating outline").setHeading();

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

		this.addFloatingLevelToggle(
			containerEl,
			"Show H1",
			"Include level-1 headings in floating outline results.",
			"floatingOutlineShowH1",
		);
		this.addFloatingLevelToggle(
			containerEl,
			"Show H2",
			"Include level-2 headings in floating outline results.",
			"floatingOutlineShowH2",
		);
		this.addFloatingLevelToggle(
			containerEl,
			"Show H3",
			"Include level-3 headings in floating outline results.",
			"floatingOutlineShowH3",
		);
		this.addFloatingLevelToggle(
			containerEl,
			"Show H4",
			"Include level-4 headings in floating outline results.",
			"floatingOutlineShowH4",
		);
		this.addFloatingLevelToggle(
			containerEl,
			"Show H5",
			"Include level-5 headings in floating outline results.",
			"floatingOutlineShowH5",
		);
		this.addFloatingLevelToggle(
			containerEl,
			"Show H6",
			"Include level-6 headings in floating outline results.",
			"floatingOutlineShowH6",
		);
	}

	private addPaletteLevelToggle(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: PaletteLevelKey,
	): void {
		new Setting(containerEl)
			.setName(name)
			.setDesc(description)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
					}),
			);
	}

	private addFloatingLevelToggle(
		containerEl: HTMLElement,
		name: string,
		description: string,
		key: FloatingOutlineLevelKey,
	): void {
		new Setting(containerEl)
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
			);
	}
}
