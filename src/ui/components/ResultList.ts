import type { ParsedHeading } from "../../parsing/headings";

export interface ResultListRow {
	heading: ParsedHeading;
	isSelected: boolean;
	quickKeyLabel?: string;
	onSelect: () => void;
}

export function renderResultList(containerEl: HTMLElement, rows: ResultListRow[]): void {
	clearElement(containerEl);

	for (const row of rows) {
		const item = document.createElement("button");
		item.type = "button";
		item.className = "heading-palette__item";
		if (row.isSelected) {
			item.classList.add("is-selected");
		}
		item.setAttribute("data-heading-id", row.heading.id);
		item.setAttribute("data-heading-line", String(row.heading.line));

		const left = document.createElement("div");
		left.className = "heading-palette__item-left";

		const level = document.createElement("span");
		level.className = "heading-palette__level";
		level.textContent = `H${row.heading.level}`;

		const text = document.createElement("span");
		text.className = "heading-palette__text";
		text.textContent = row.heading.text;

		left.append(level, text);
		item.append(left);

		if (row.quickKeyLabel) {
			const quickKey = document.createElement("span");
			quickKey.className = "heading-palette__quick-key";
			quickKey.textContent = row.quickKeyLabel;
			item.append(quickKey);
		}

		item.addEventListener("click", row.onSelect);
		containerEl.append(item);
	}
}

export function renderEmptyState(containerEl: HTMLElement, message: string): void {
	clearElement(containerEl);
	const empty = document.createElement("div");
	empty.className = "heading-palette__empty";
	empty.textContent = message;
	containerEl.append(empty);
}

function clearElement(element: HTMLElement): void {
	while (element.firstChild) {
		element.removeChild(element.firstChild);
	}
}
