import type QuickHeadingPalettePlugin from "../main";

export const OPEN_HEADING_PALETTE_COMMAND_ID = "open-heading-palette";

export function registerOpenHeadingPaletteCommand(plugin: QuickHeadingPalettePlugin): void {
	plugin.addCommand({
		id: OPEN_HEADING_PALETTE_COMMAND_ID,
		name: "Toggle heading palette",
		callback: () => {
			plugin.toggleHeadingPalette();
		},
	});
}
