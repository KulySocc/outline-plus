import { App, FuzzySuggestModal, MarkdownView } from "obsidian";
import type { FuzzyMatch, Hotkey, KeymapEventHandler } from "obsidian";
import { getActiveDocumentLine, resolveActiveHeadingForLevels } from "../navigation/activeHeading";
import { jumpToHeading } from "../navigation/jumpToHeading";
import type { ParsedHeading } from "../parsing/headings";
import { filterHeadingsByLevels, parseHeadings } from "../parsing/headings";
import { getEnabledHeadingLevels, type HeadingPaletteSettings } from "../settings/settings";

interface HeadingPaletteModalOptions {
	view: MarkdownView;
	settings: HeadingPaletteSettings;
	onClose?: () => void;
	toggleCommandId?: string;
}

interface AppWithHotkeyManager extends App {
	hotkeyManager?: {
		getHotkeys?: (commandId: string) => Hotkey[] | null | undefined;
	};
}

export class HeadingPaletteModal extends FuzzySuggestModal<ParsedHeading> {
	private readonly view: MarkdownView;
	private readonly items: ParsedHeading[];
	private readonly searchableItems: ParsedHeading[];
	private readonly searchHiddenHeadings: boolean;
	private readonly onModalClose?: () => void;
	private readonly toggleCommandId?: string;
	private readonly initialActiveHeadingId: string | null;
	private toggleHotkeyHandlers: KeymapEventHandler[] = [];
	private hasAppliedInitialSelection = false;
	private prefixByHeadingId = new Map<string, string>();
	private topLevelHeadingIds = new Set<string>();
	private activeQuery = "";

	private readonly onAdvancedArrowKeydown = (event: KeyboardEvent): void => {
		if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
			return;
		}

		const direction = event.key === "ArrowDown" ? 1 : -1;

		if (event.altKey) {
			event.preventDefault();
			this.jumpBetweenTopLevel(direction);
			return;
		}

		if (event.metaKey) {
			event.preventDefault();
			this.jumpSelectionToBoundary(direction);
		}
	};

	constructor(app: App, options: HeadingPaletteModalOptions) {
		super(app);
		this.view = options.view;
		this.onModalClose = options.onClose;
		this.toggleCommandId = options.toggleCommandId;

		const headings = parseHeadings(this.view.editor.getValue());
		const enabledLevels = getEnabledHeadingLevels(options.settings);
		this.items = filterHeadingsByLevels(headings, enabledLevels);
		this.searchableItems = headings;
		this.searchHiddenHeadings = options.settings.searchHiddenHeadings;
		const activeLine = getActiveDocumentLine(this.view, headings);
		const initialHeading = activeLine === null
			? null
			: resolveActiveHeadingForLevels(headings, activeLine, enabledLevels);
		this.initialActiveHeadingId = initialHeading?.id ?? null;

		this.setPlaceholder("Search headings...");
		this.emptyStateText = "No headings found.";
	}

	onOpen(): void {
		void super.onOpen();
		this.inputEl.addEventListener("keydown", this.onAdvancedArrowKeydown);
		this.registerToggleHotkeys();
		this.applyInitialSelectionSoon();
	}

	onClose(): void {
		this.inputEl.removeEventListener("keydown", this.onAdvancedArrowKeydown);
		this.unregisterToggleHotkeys();
		super.onClose();
		this.onModalClose?.();
	}

	getItems(): ParsedHeading[] {
		if (this.searchHiddenHeadings && this.activeQuery.trim().length > 0) {
			return this.searchableItems;
		}

		return this.items;
	}

	getItemText(item: ParsedHeading): string {
		return item.text;
	}

	getSuggestions(query: string): FuzzyMatch<ParsedHeading>[] {
		this.activeQuery = query;
		const matches = sortMatchesByDocumentOrder(super.getSuggestions(query), query);
		const items = matches.map((match) => match.item);
		this.prefixByHeadingId = buildTreePrefixes(items);

		const minLevel = items.reduce((min, item) => Math.min(min, item.level), Number.POSITIVE_INFINITY);
		this.topLevelHeadingIds = new Set(
			Number.isFinite(minLevel) ? items.filter((item) => item.level === minLevel).map((item) => item.id) : [],
		);

		return matches;
	}

	renderSuggestion(match: FuzzyMatch<ParsedHeading>, el: HTMLElement): void {
		el.empty();
		el.setAttribute("data-heading-id", match.item.id);
		const isTopLevel = this.topLevelHeadingIds.has(match.item.id);
		el.classList.toggle("heading-palette-suggest-item--top", isTopLevel);
		el.classList.toggle("heading-palette-suggest-item--sub", !isTopLevel);
		const row = el.createDiv({
			cls: `heading-palette-suggest-row ${isTopLevel ? "heading-palette-suggest-row--top" : "heading-palette-suggest-row--sub"}`,
		});
		row.createSpan({
			cls: "heading-palette-suggest-level",
			text: this.prefixByHeadingId.get(match.item.id) ?? `H${match.item.level} `,
		});
		row.createSpan({ cls: "heading-palette-suggest-title", text: match.item.text });
	}

	onChooseItem(item: ParsedHeading): void {
		void jumpToHeading(this.app, this.view, item);
	}

	private jumpBetweenTopLevel(direction: number): void {
		const suggestionItems = Array.from(
			this.resultContainerEl.querySelectorAll<HTMLElement>(".suggestion-item"),
		);
		if (suggestionItems.length === 0) {
			return;
		}

		const currentIndex = suggestionItems.findIndex((item) => item.classList.contains("is-selected"));
		const start = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : suggestionItems.length;

		let targetIndex = -1;
		for (
			let cursor = start + direction;
			cursor >= 0 && cursor < suggestionItems.length;
			cursor += direction
		) {
			const item = suggestionItems[cursor];
			if (!item) {
				continue;
			}
			if (item.classList.contains("heading-palette-suggest-item--top")) {
				targetIndex = cursor;
				break;
			}
		}

		if (targetIndex < 0) {
			return;
		}

		const key = direction >= 0 ? "ArrowDown" : "ArrowUp";
		const base = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : suggestionItems.length;
		const steps = Math.abs(targetIndex - base);
		for (let step = 0; step < steps; step += 1) {
			this.dispatchNativeArrowKey(key);
		}
	}

	private jumpSelectionToBoundary(direction: number): void {
		const suggestionItems = Array.from(
			this.resultContainerEl.querySelectorAll<HTMLElement>(".suggestion-item"),
		);
		if (suggestionItems.length === 0) {
			return;
		}

		const targetIndex = direction >= 0 ? suggestionItems.length - 1 : 0;
		const targetItem = suggestionItems[targetIndex];
		if (!targetItem) {
			return;
		}

		targetItem.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		targetItem.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		targetItem.scrollIntoView({ block: "nearest" });

		if (this.getSelectedSuggestionIndex(suggestionItems) === targetIndex) {
			return;
		}

		const key = direction >= 0 ? "ArrowDown" : "ArrowUp";
		const safetySteps = suggestionItems.length + 4;
		for (let step = 0; step < safetySteps; step += 1) {
			this.dispatchNativeArrowKey(key);
			if (this.getSelectedSuggestionIndex(suggestionItems) === targetIndex) {
				break;
			}
		}
	}

	private getSelectedSuggestionIndex(items: HTMLElement[]): number {
		return items.findIndex((item) => item.classList.contains("is-selected"));
	}

	private dispatchNativeArrowKey(key: "ArrowDown" | "ArrowUp"): void {
		const simulated = new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		});
		this.inputEl.dispatchEvent(simulated);
	}

	private registerToggleHotkeys(): void {
		this.unregisterToggleHotkeys();

		if (!this.toggleCommandId) {
			return;
		}

		const hotkeyManager = (this.app as AppWithHotkeyManager).hotkeyManager;
		const hotkeys = hotkeyManager?.getHotkeys?.(this.toggleCommandId) ?? [];
		for (const hotkey of hotkeys) {
			if (!hotkey.key) {
				continue;
			}

			const handler = this.scope.register(hotkey.modifiers ?? [], hotkey.key, (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.close();
				return false;
			});
			this.toggleHotkeyHandlers.push(handler);
		}
	}

	private unregisterToggleHotkeys(): void {
		for (const handler of this.toggleHotkeyHandlers) {
			this.scope.unregister(handler);
		}
		this.toggleHotkeyHandlers = [];
	}

	private applyInitialSelectionSoon(): void {
		if (!this.initialActiveHeadingId) {
			return;
		}

		const apply = (): void => {
			this.applyInitialSelection();
		};

		window.requestAnimationFrame(apply);
		window.setTimeout(apply, 24);
		window.setTimeout(apply, 80);
	}

	private applyInitialSelection(): void {
		if (this.hasAppliedInitialSelection || !this.initialActiveHeadingId) {
			return;
		}
		if (this.inputEl.value.trim().length > 0) {
			return;
		}

		const target = this.resultContainerEl.querySelector<HTMLElement>(
			`.suggestion-item[data-heading-id="${CSS.escape(this.initialActiveHeadingId)}"]`,
		);
		if (!target) {
			return;
		}

		target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
		target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		target.scrollIntoView({ block: "nearest" });
		this.hasAppliedInitialSelection = true;
	}

}

function sortMatchesByDocumentOrder(
	matches: FuzzyMatch<ParsedHeading>[],
	query: string,
): FuzzyMatch<ParsedHeading>[] {
	if (query.trim().length === 0 || matches.length <= 1) {
		return matches;
	}

	const [topMatch, ...remainingMatches] = matches;
	if (!topMatch || remainingMatches.length === 0) {
		return matches;
	}

	const sortedRemaining = remainingMatches
		.map((match, index) => ({ match, index }))
		.sort((a, b) => {
			const lineDifference = a.match.item.line - b.match.item.line;
			if (lineDifference !== 0) {
				return lineDifference;
			}
			return a.index - b.index;
		})
		.map(({ match }) => match);

	return [topMatch, ...sortedRemaining];
}

function buildTreePrefixes(items: ParsedHeading[]): Map<string, string> {
	const prefixById = new Map<string, string>();

	for (let index = 0; index < items.length; index += 1) {
		const current = items[index];
		if (!current) {
			continue;
		}
		if (current.level <= 2) {
			prefixById.set(current.id, `H${current.level} `);
			continue;
		}

		let prefix = "";
		for (let ancestorLevel = 3; ancestorLevel < current.level; ancestorLevel += 1) {
			const ancestorIndex = findAncestorIndex(items, index, ancestorLevel);
			const ancestorHasSibling = ancestorIndex >= 0
				? hasNextSiblingAtLevel(items, ancestorIndex, ancestorLevel)
				: false;
			prefix += ancestorHasSibling ? "│   " : "    ";
		}

		const hasSibling = hasNextSiblingAtLevel(items, index, current.level);
		const branch = hasSibling ? "├── " : "└── ";
		prefixById.set(current.id, `${prefix}${branch}H${current.level} `);
	}

	return prefixById;
}

function findAncestorIndex(items: ParsedHeading[], index: number, level: number): number {
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		const candidate = items[cursor];
		if (!candidate) {
			continue;
		}
		const candidateLevel = candidate.level;
		if (candidateLevel === level) {
			return cursor;
		}
		if (candidateLevel < level) {
			return -1;
		}
	}
	return -1;
}

function hasNextSiblingAtLevel(items: ParsedHeading[], index: number, level: number): boolean {
	for (let cursor = index + 1; cursor < items.length; cursor += 1) {
		const candidate = items[cursor];
		if (!candidate) {
			continue;
		}
		const candidateLevel = candidate.level;
		if (candidateLevel < level) {
			return false;
		}
		if (candidateLevel === level) {
			return true;
		}
	}
	return false;
}
