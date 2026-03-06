import { MarkdownView } from "obsidian";
import type { HeadingLevel, ParsedHeading } from "../parsing/headings";

const VIEWPORT_ANCHOR_OFFSET = 24;

export function getActiveDocumentLine(view: MarkdownView, headings: ParsedHeading[]): number | null {
	if (view.getMode() === "preview") {
		return getActiveLineFromPreview(view, headings) ?? getActiveLineFromCursor(view);
	}
	return getActiveLineFromSourceViewport(view) ?? getActiveLineFromCursor(view);
}

export function resolveActiveHeadingForLevels(
	allHeadings: ParsedHeading[],
	activeLine: number,
	enabledLevels: Set<HeadingLevel>,
): ParsedHeading | null {
	if (allHeadings.length === 0 || enabledLevels.size === 0) {
		return null;
	}

	const rawIndex = findActiveHeadingIndex(allHeadings, activeLine);
	const rawHeading = allHeadings[rawIndex] ?? null;
	if (!rawHeading) {
		return null;
	}

	if (enabledLevels.has(rawHeading.level)) {
		return rawHeading;
	}

	const ancestor = findNearestEnabledAncestor(allHeadings, rawIndex, enabledLevels);
	if (ancestor) {
		return ancestor;
	}

	for (let cursor = rawIndex; cursor >= 0; cursor -= 1) {
		const candidate = allHeadings[cursor];
		if (candidate && enabledLevels.has(candidate.level)) {
			return candidate;
		}
	}

	for (const heading of allHeadings) {
		if (enabledLevels.has(heading.level)) {
			return heading;
		}
	}

	return null;
}

export function getActiveHeading(
	view: MarkdownView,
	allHeadings: ParsedHeading[],
	enabledLevels: Set<HeadingLevel>,
): ParsedHeading | null {
	const activeLine = getActiveDocumentLine(view, allHeadings);
	if (activeLine === null) {
		return null;
	}
	return resolveActiveHeadingForLevels(allHeadings, activeLine, enabledLevels);
}

function getActiveLineFromPreview(view: MarkdownView, headings: ParsedHeading[]): number | null {
	const previewRoot = view.previewMode?.containerEl;
	if (!previewRoot) {
		return null;
	}

	const scrollContainer = previewRoot.querySelector<HTMLElement>(".markdown-preview-view") ?? previewRoot;
	const headingElements = Array.from(scrollContainer.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));
	if (headingElements.length === 0) {
		return null;
	}

	const anchorY = scrollContainer.getBoundingClientRect().top + VIEWPORT_ANCHOR_OFFSET;
	let selectedEl: HTMLElement | null = null;

	for (const headingEl of headingElements) {
		if (headingEl.getBoundingClientRect().top <= anchorY) {
			selectedEl = headingEl;
			continue;
		}
		break;
	}

	const fallbackEl = selectedEl ?? headingElements[0] ?? null;
	if (!fallbackEl) {
		return null;
	}

	const matched = matchPreviewHeadingElementToParsed(fallbackEl, headings);
	return matched?.line ?? headings[0]?.line ?? null;
}

function getActiveLineFromSourceViewport(view: MarkdownView): number | null {
	const scroller = view.containerEl.querySelector<HTMLElement>(".cm-scroller");
	if (!scroller) {
		return null;
	}

	const lineHeight = estimateSourceLineHeight(view);
	if (lineHeight <= 0) {
		return null;
	}

	return Math.max(0, Math.floor((scroller.scrollTop + VIEWPORT_ANCHOR_OFFSET) / lineHeight));
}

function getActiveLineFromCursor(view: MarkdownView): number | null {
	const cursor = view.editor?.getCursor();
	return cursor?.line ?? null;
}

function findActiveHeadingIndex(headings: ParsedHeading[], activeLine: number): number {
	let activeIndex = 0;
	for (let index = 0; index < headings.length; index += 1) {
		const heading = headings[index];
		if (!heading) {
			continue;
		}
		if (heading.line > activeLine) {
			break;
		}
		activeIndex = index;
	}
	return activeIndex;
}

function findNearestEnabledAncestor(
	headings: ParsedHeading[],
	activeIndex: number,
	enabledLevels: Set<HeadingLevel>,
): ParsedHeading | null {
	const active = headings[activeIndex];
	if (!active) {
		return null;
	}

	let targetLevel = active.level;
	for (let cursor = activeIndex - 1; cursor >= 0; cursor -= 1) {
		const candidate = headings[cursor];
		if (!candidate) {
			continue;
		}
		if (candidate.level >= targetLevel) {
			continue;
		}
		targetLevel = candidate.level;
		if (enabledLevels.has(candidate.level)) {
			return candidate;
		}
		if (targetLevel === 1) {
			break;
		}
	}

	return null;
}

function estimateSourceLineHeight(view: MarkdownView): number {
	const lineEl = view.containerEl.querySelector<HTMLElement>(".cm-line");
	if (lineEl && lineEl.offsetHeight > 0) {
		return lineEl.offsetHeight;
	}

	const scroller = view.containerEl.querySelector<HTMLElement>(".cm-scroller");
	if (!scroller) {
		return 0;
	}

	const lineHeight = Number.parseFloat(getComputedStyle(scroller).lineHeight);
	return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 0;
}

function matchPreviewHeadingElementToParsed(
	headingEl: HTMLElement,
	headings: ParsedHeading[],
): ParsedHeading | null {
	const level = parseHeadingLevel(headingEl.tagName);
	const normalizedText = normalizeHeadingText(headingEl.textContent ?? "");

	const lineFromAttr = Number.parseInt(headingEl.getAttribute("data-line") ?? "", 10);
	if (Number.isFinite(lineFromAttr)) {
		const byLine = headings.find((heading) => heading.line === lineFromAttr);
		if (byLine) {
			return byLine;
		}
	}

	for (const heading of headings) {
		if (heading.level === level && normalizeHeadingText(heading.text) === normalizedText) {
			return heading;
		}
	}

	for (const heading of headings) {
		if (normalizeHeadingText(heading.text) === normalizedText) {
			return heading;
		}
	}

	return null;
}

function parseHeadingLevel(tagName: string): 1 | 2 | 3 | 4 | 5 | 6 {
	const parsed = Number.parseInt(tagName.replace(/^H/i, ""), 10);
	if (parsed >= 1 && parsed <= 6) {
		return parsed as 1 | 2 | 3 | 4 | 5 | 6;
	}
	return 1;
}

function normalizeHeadingText(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
