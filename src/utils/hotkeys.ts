import { Platform } from "obsidian";

export const QUICK_KEY_LIMIT = 9;

export function getQuickKeyLabel(index: number): string | undefined {
	if (index < 0 || index >= QUICK_KEY_LIMIT) {
		return undefined;
	}

	const keyNumber = index + 1;
	return Platform.isMacOS ? `⌘${keyNumber}` : `Ctrl+${keyNumber}`;
}
