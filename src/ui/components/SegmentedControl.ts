export type PaletteMode = "outline" | "global";

export interface SegmentedControlProps {
	mode: PaletteMode;
	onModeChange: (mode: PaletteMode) => void;
}

export function createSegmentedControl(_props: SegmentedControlProps): HTMLElement {
	const wrapper = document.createElement("div");
	wrapper.className = "heading-palette__segmented-control heading-palette__segmented-control--placeholder";
	wrapper.setAttribute("aria-hidden", "true");
	return wrapper;
}
