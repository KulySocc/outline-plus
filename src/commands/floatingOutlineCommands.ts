import type QuickHeadingPalettePlugin from "../main";

export const TOGGLE_FLOATING_OUTLINE_COMMAND_ID = "toggle-floating-outline";
export const ENABLE_FLOATING_OUTLINE_COMMAND_ID = "enable-floating-outline";
export const DISABLE_FLOATING_OUTLINE_COMMAND_ID = "disable-floating-outline";

export function registerFloatingOutlineCommands(
	plugin: QuickHeadingPalettePlugin,
): void {
	plugin.addCommand({
		id: TOGGLE_FLOATING_OUTLINE_COMMAND_ID,
		name: "Toggle floating outline",
		callback: () => {
			void plugin.toggleFloatingOutline();
		},
	});

	plugin.addCommand({
		id: ENABLE_FLOATING_OUTLINE_COMMAND_ID,
		name: "Enable floating outline",
		callback: () => {
			void plugin.setFloatingOutlineEnabled(true);
		},
	});

	plugin.addCommand({
		id: DISABLE_FLOATING_OUTLINE_COMMAND_ID,
		name: "Disable floating outline",
		callback: () => {
			void plugin.setFloatingOutlineEnabled(false);
		},
	});
}
