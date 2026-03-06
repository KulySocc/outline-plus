import { MarkdownView, Notice, Plugin } from "obsidian";
import { registerFloatingOutlineCommands } from "./commands/floatingOutlineCommands";
import { OPEN_HEADING_PALETTE_COMMAND_ID, registerOpenHeadingPaletteCommand } from "./commands/openHeadingPalette";
import { FloatingOutlineController } from "./outline/FloatingOutlineController";
import { HeadingPaletteSettingTab } from "./settings/SettingsTab";
import { DEFAULT_SETTINGS, type HeadingPaletteSettings } from "./settings/settings";
import { HeadingPaletteModal } from "./ui/HeadingPaletteModal";

export default class QuickHeadingPalettePlugin extends Plugin {
	settings: HeadingPaletteSettings = { ...DEFAULT_SETTINGS };
	private floatingOutlineController: FloatingOutlineController | null = null;
	private headingPaletteModal: HeadingPaletteModal | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		registerOpenHeadingPaletteCommand(this);
		registerFloatingOutlineCommands(this);
		this.addSettingTab(new HeadingPaletteSettingTab(this.app, this));

		this.floatingOutlineController = new FloatingOutlineController(this);
		this.floatingOutlineController.mount();

		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refreshFloatingOutline()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.refreshFloatingOutline()));
		this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshFloatingOutline()));
		this.registerEvent(
			this.app.workspace.on("editor-change", (_editor, view) => {
				if (view !== this.app.workspace.getActiveViewOfType(MarkdownView)) {
					return;
				}
				this.refreshFloatingOutline();
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				const activeFile = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
				if (!activeFile || file.path !== activeFile.path) {
					return;
				}
				this.refreshFloatingOutline();
			}),
		);
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.refreshFloatingOutline()));
	}

	onunload(): void {
		this.headingPaletteModal?.close();
		this.headingPaletteModal = null;
		this.floatingOutlineController?.unmount();
		this.floatingOutlineController = null;
	}

	async loadSettings(): Promise<void> {
		type LegacySettings = Partial<HeadingPaletteSettings> & { floatingOutlineNearContent?: boolean };
		const data = await this.loadData() as LegacySettings | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

		if (data?.floatingOutlineAlignment !== "to-content" && data?.floatingOutlineAlignment !== "to-window") {
			this.settings.floatingOutlineAlignment = data?.floatingOutlineNearContent ? "to-content" : "to-window";
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshFloatingOutline(): void {
		this.floatingOutlineController?.refresh();
	}

	async toggleFloatingOutline(): Promise<void> {
		await this.setFloatingOutlineEnabled(!this.settings.floatingOutlineEnabled);
	}

	async setFloatingOutlineEnabled(enabled: boolean): Promise<void> {
		if (this.settings.floatingOutlineEnabled === enabled) {
			return;
		}

		this.settings.floatingOutlineEnabled = enabled;
		await this.saveSettings();
		this.refreshFloatingOutline();
	}

	toggleHeadingPalette(): void {
		if (this.headingPaletteModal) {
			this.headingPaletteModal.close();
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView?.editor) {
			new Notice("Open a Markdown note to use Heading Palette.");
			return;
		}

		const modal = new HeadingPaletteModal(this.app, {
			view: activeView,
			settings: this.settings,
			toggleCommandId: `${this.manifest.id}:${OPEN_HEADING_PALETTE_COMMAND_ID}`,
			onClose: () => {
				if (this.headingPaletteModal === modal) {
					this.headingPaletteModal = null;
				}
			},
		});
		this.headingPaletteModal = modal;
		modal.open();
	}
}
