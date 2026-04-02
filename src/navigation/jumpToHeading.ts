import { App, MarkdownView, Notice } from "obsidian";
import type { EditorPosition } from "obsidian";
import type { ParsedHeading } from "../parsing/headings";

const PREVIEW_FLASH_CLASS = "heading-palette-preview-flash";
const SOURCE_FLASH_CLASS = "heading-palette-source-flash";
const navigationTokenByView = new WeakMap<MarkdownView, number>();
const recentSourceNavigationLineByView = new WeakMap<MarkdownView, { line: number; expiresAt: number }>();
const RECENT_SOURCE_NAVIGATION_WINDOW_MS = 1200;

export async function jumpToHeading(app: App, view: MarkdownView, item: ParsedHeading): Promise<void> {
	const token = nextNavigationToken(view);
	app.workspace.setActiveLeaf(view.leaf, { focus: true });

	if (view.getMode() === "preview") {
		const didUseNativeNavigation = await navigateInPreviewViaNativeLink(app, view, item, token);
		if (token !== getNavigationToken(view)) {
			return;
		}
		if (didUseNativeNavigation) {
			return;
		}

		const didJump = await navigateInPreview(view, item, token);
		if (token !== getNavigationToken(view)) {
			return;
		}
		if (didJump) {
			return;
		}
	}

	navigateInSource(view, item.line);
	flashSourceHeading(view, item);
}

export function getRecentSourceNavigationLine(view: MarkdownView): number | null {
	const entry = recentSourceNavigationLineByView.get(view);
	if (!entry) {
		return null;
	}

	if (Date.now() > entry.expiresAt) {
		recentSourceNavigationLineByView.delete(view);
		return null;
	}

	return entry.line;
}

async function navigateInPreviewViaNativeLink(
	app: App,
	view: MarkdownView,
	item: ParsedHeading,
	token: number,
): Promise<boolean> {
	const file = view.file;
	if (!file) {
		return false;
	}

	const linkpath = app.metadataCache.fileToLinktext(file, file.path, true);
	const linktext = `${linkpath}#${item.text}`;
	const previousScroll = view.previewMode?.getScroll() ?? null;

	await app.workspace.openLinkText(linktext, file.path, false, { active: true });
	if (token !== getNavigationToken(view)) {
		return false;
	}

	await refinePreviewHeadingAlignment(view, item, token);
	if (token !== getNavigationToken(view)) {
		return false;
	}

	const nextScroll = view.previewMode?.getScroll() ?? null;
	if (previousScroll === null || nextScroll === null) {
		return true;
	}

	return Math.abs(nextScroll - previousScroll) > 1;
}

async function refinePreviewHeadingAlignment(
	view: MarkdownView,
	item: ParsedHeading,
	token: number,
): Promise<void> {
	const previewRoot = view.previewMode?.containerEl;
	if (!previewRoot) {
		return;
	}

	const scrollContainer = getPreviewScrollContainer(previewRoot);
	const maxAttempts = 5;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		if (token !== getNavigationToken(view)) {
			return;
		}

		const target = findPreviewHeadingElement(previewRoot, item);
		if (target) {
			alignPreviewTargetTop(target, scrollContainer);
			return;
		}

		await delay(40);
	}
}

function nextNavigationToken(view: MarkdownView): number {
	const token = (navigationTokenByView.get(view) ?? 0) + 1;
	navigationTokenByView.set(view, token);
	return token;
}

function getNavigationToken(view: MarkdownView): number {
	return navigationTokenByView.get(view) ?? 0;
}

function navigateInSource(view: MarkdownView, line: number): void {
	const editor = view.editor;
	if (!editor) {
		new Notice("No active editor found.");
		return;
	}

	recentSourceNavigationLineByView.set(view, {
		line,
		expiresAt: Date.now() + RECENT_SOURCE_NAVIGATION_WINDOW_MS,
	});

	const position: EditorPosition = { line, ch: 0 };
	editor.setCursor(position);
	editor.focus();
	forceTopAlignInEditor(view, position);
}

function forceTopAlignInEditor(view: MarkdownView, position: EditorPosition): void {
	const editor = view.editor;
	if (!editor) {
		return;
	}

	const range = { from: position, to: position };
	const alignTop = (): void => {
		editor.scrollIntoView(range, false);
		alignSourceByActiveLine(view);
	};

	alignTop();
	window.requestAnimationFrame(alignTop);
	window.setTimeout(alignTop, 32);
	window.setTimeout(alignTop, 96);
	window.setTimeout(alignTop, 220);
	window.setTimeout(alignTop, 420);
}

function alignSourceByActiveLine(view: MarkdownView): void {
	const scroller = view.containerEl.querySelector<HTMLElement>(".cm-scroller");
	const activeLine = view.containerEl.querySelector<HTMLElement>(".cm-active.cm-line");
	if (!scroller || !activeLine) {
		return;
	}

	const top = activeLine.offsetTop;
	scroller.scrollTop = top;
	view.editor.scrollTo(null, top);
}

async function navigateInPreview(view: MarkdownView, item: ParsedHeading, token: number): Promise<boolean> {
	const previewRoot = view.previewMode?.containerEl;
	if (!previewRoot) {
		return false;
	}

	const scrollContainer = getPreviewScrollContainer(previewRoot);
	const maxAttempts = 8;
	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		if (token !== getNavigationToken(view)) {
			return false;
		}

		const target = findPreviewHeadingElement(previewRoot, item);
		if (target) {
			alignPreviewTargetTop(target, scrollContainer);
			target.classList.add(PREVIEW_FLASH_CLASS);
			window.setTimeout(() => target.classList.remove(PREVIEW_FLASH_CLASS), 360);
			return true;
		}

		coarseScrollPreview(view, scrollContainer, item.line);
		await delay(56);
	}

	return false;
}

function getPreviewScrollContainer(previewRoot: HTMLElement): HTMLElement {
	return previewRoot.querySelector<HTMLElement>(".markdown-preview-view") ?? previewRoot;
}

function alignPreviewTargetTop(target: HTMLElement, scrollContainer: HTMLElement): void {
	const alignTop = (): void => {
		const targetTop =
			target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop;
		scrollContainer.scrollTo({ top: targetTop, behavior: "auto" });
	};

	alignTop();
	window.requestAnimationFrame(alignTop);
	window.setTimeout(alignTop, 24);
	window.setTimeout(alignTop, 96);
	window.setTimeout(alignTop, 220);
	window.setTimeout(alignTop, 420);
}

function coarseScrollPreview(view: MarkdownView, scrollContainer: HTMLElement, targetLine: number): void {
	const lineCount = Math.max(1, view.editor.lineCount() - 1);
	const ratio = clamp(targetLine / lineCount, 0, 1);
	const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
	scrollContainer.scrollTo({ top: Math.floor(maxScrollTop * ratio), behavior: "auto" });
}

function findPreviewHeadingElement(root: HTMLElement, item: ParsedHeading): HTMLElement | null {
	const lineCandidate = root.querySelector<HTMLElement>(`[data-line="${item.line}"]`);
	if (lineCandidate) {
		const directHeading = lineCandidate.matches(`h${item.level}`) ? lineCandidate : null;
		if (directHeading && matchesHeadingElement(directHeading, item)) {
			return directHeading;
		}

		const nestedHeading = lineCandidate.querySelector<HTMLElement>(`h${item.level}`);
		if (nestedHeading && matchesHeadingElement(nestedHeading, item)) {
			return nestedHeading;
		}

		if (matchesHeadingElement(lineCandidate, item)) {
			return lineCandidate;
		}
	}

	const allByLevel = Array.from(root.querySelectorAll<HTMLElement>(`h${item.level}`));
	for (const headingEl of allByLevel) {
		if (matchesHeadingElement(headingEl, item)) {
			return headingEl;
		}
	}

	return null;
}

function matchesHeadingElement(el: HTMLElement, item: ParsedHeading): boolean {
	return normalizeHeadingText(el.textContent ?? "") === normalizeHeadingText(item.text);
}

function flashSourceHeading(view: MarkdownView, item: ParsedHeading): void {
	const editorRoot = view.containerEl.querySelector<HTMLElement>(".cm-editor");
	if (!editorRoot) {
		return;
	}

	const lines = Array.from(editorRoot.querySelectorAll<HTMLElement>(".cm-line"));
	const target = lines.find((lineEl) => {
		const lineText = normalizeMarkdownHeadingLine(lineEl.textContent ?? "");
		return lineText === normalizeHeadingText(item.text);
	});

	if (!target) {
		return;
	}

	target.classList.add(SOURCE_FLASH_CLASS);
	window.setTimeout(() => target.classList.remove(SOURCE_FLASH_CLASS), 280);
}

function normalizeHeadingText(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function normalizeMarkdownHeadingLine(value: string): string {
	const withoutHashes = value.replace(/^\s{0,3}#{1,6}\s*/, "");
	return normalizeHeadingText(withoutHashes);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
