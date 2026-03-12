import type { HeadingLevel } from "../parsing/headings";

export interface HeadingPaletteSettings {
	showH1: boolean;
	showH2: boolean;
	showH3: boolean;
	showH4: boolean;
	showH5: boolean;
	showH6: boolean;
	searchHiddenHeadings: boolean;
	floatingOutlineEnabled: boolean;
	floatingOutlineSide: "left" | "right";
	floatingOutlineAlignment: "to-content" | "to-window";
	floatingOutlineOpacity: number;
	floatingOutlineShowH1: boolean;
	floatingOutlineShowH2: boolean;
	floatingOutlineShowH3: boolean;
	floatingOutlineShowH4: boolean;
	floatingOutlineShowH5: boolean;
	floatingOutlineShowH6: boolean;
	floatingOutlineHideBelowPx: number;
}

export const DEFAULT_SETTINGS: HeadingPaletteSettings = {
	showH1: true,
	showH2: true,
	showH3: true,
	showH4: true,
	showH5: true,
	showH6: true,
	searchHiddenHeadings: false,
	floatingOutlineEnabled: true,
	floatingOutlineSide: "right",
	floatingOutlineAlignment: "to-window",
	floatingOutlineOpacity: 100,
	floatingOutlineShowH1: true,
	floatingOutlineShowH2: true,
	floatingOutlineShowH3: true,
	floatingOutlineShowH4: true,
	floatingOutlineShowH5: true,
	floatingOutlineShowH6: true,
	floatingOutlineHideBelowPx: 1100,
};

export function getEnabledHeadingLevels(settings: HeadingPaletteSettings): Set<HeadingLevel> {
	const levels = new Set<HeadingLevel>();

	if (settings.showH1) levels.add(1);
	if (settings.showH2) levels.add(2);
	if (settings.showH3) levels.add(3);
	if (settings.showH4) levels.add(4);
	if (settings.showH5) levels.add(5);
	if (settings.showH6) levels.add(6);

	return levels;
}

export function getEnabledFloatingOutlineLevels(settings: HeadingPaletteSettings): Set<HeadingLevel> {
	const levels = new Set<HeadingLevel>();

	if (settings.floatingOutlineShowH1) levels.add(1);
	if (settings.floatingOutlineShowH2) levels.add(2);
	if (settings.floatingOutlineShowH3) levels.add(3);
	if (settings.floatingOutlineShowH4) levels.add(4);
	if (settings.floatingOutlineShowH5) levels.add(5);
	if (settings.floatingOutlineShowH6) levels.add(6);

	return levels;
}
