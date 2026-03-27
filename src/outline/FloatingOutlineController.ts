import { MarkdownView } from "obsidian";
import { getActiveDocumentLine, resolveActiveHeadingForLevels } from "../navigation/activeHeading";
import { jumpToHeading } from "../navigation/jumpToHeading";
import { filterHeadingsByLevels, type HeadingLevel, parseHeadings, type ParsedHeading } from "../parsing/headings";
import { getEnabledFloatingOutlineLevels } from "../settings/settings";
import type QuickHeadingPalettePlugin from "../main";

interface RenderedOutlineNode {
	heading: ParsedHeading;
	itemEl: HTMLLIElement;
	linkEl: HTMLAnchorElement;
	contextualListEl: HTMLUListElement | null;
}

export class FloatingOutlineController {
	private readonly plugin: QuickHeadingPalettePlugin;
	private rootEl: HTMLElement | null = null;
	private listEl: HTMLUListElement | null = null;
	private activeView: MarkdownView | null = null;
	private activeLeafContainer: HTMLElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private allHeadings: ParsedHeading[] = [];
	private renderedHeadings: ParsedHeading[] = [];
	private enabledLevels = new Set<HeadingLevel>();
	private linkByHeadingId = new Map<string, HTMLAnchorElement>();
	private nodeByHeadingId = new Map<string, RenderedOutlineNode>();
	private activeHeadingId: string | null = null;
	private expandedHeadingId: string | null = null;
	private sourceScrollEl: HTMLElement | null = null;
	private previewScrollEl: HTMLElement | null = null;

	private readonly onTrackedScroll = (): void => {
		this.updateActiveHeading();
	};

	constructor(plugin: QuickHeadingPalettePlugin) {
		this.plugin = plugin;
	}

	mount(): void {
		if (this.rootEl) {
			this.refresh();
			return;
		}

		const root = document.createElement("aside");
		root.className = "outline-plus-floating-outline is-hidden";

		const list = document.createElement("ul");
		list.className = "outline-plus-floating-outline__list";
		root.appendChild(list);

		this.rootEl = root;
		this.listEl = list;

		this.refresh();
	}

	unmount(): void {
		this.disconnectResizeObserver();
		this.disconnectTrackedScrollListeners();
		this.activeView = null;
		this.activeLeafContainer = null;
		this.allHeadings = [];
		this.renderedHeadings = [];
		this.enabledLevels.clear();
		this.linkByHeadingId.clear();
		this.nodeByHeadingId.clear();
		this.activeHeadingId = null;
		this.expandedHeadingId = null;

		if (this.rootEl) {
			this.rootEl.remove();
		}

		this.rootEl = null;
		this.listEl = null;
	}

	refresh(): void {
		if (!this.rootEl || !this.listEl) {
			return;
		}

		const activeView = this.getActiveMarkdownView();
		this.activeView = activeView;
		this.syncContainer();
		this.syncTrackedScrollListeners();
		this.applySide();
		this.applyAppearance();
		this.applyAlignmentPosition();

		if (!activeView || !activeView.editor) {
			this.allHeadings = [];
			this.enabledLevels = new Set<HeadingLevel>();
			this.renderList([]);
			this.updateActiveHeading();
			this.applyVisibility();
			return;
		}

		this.allHeadings = parseHeadings(activeView.editor.getValue());
		this.enabledLevels = getEnabledFloatingOutlineLevels(this.plugin.settings);
		const filtered = filterHeadingsByLevels(this.allHeadings, this.enabledLevels);
		this.renderList(filtered);
		this.updateActiveHeading();
		this.applyVisibility();
	}

	applyVisibility(): void {
		if (!this.rootEl || !this.listEl) {
			return;
		}

		const enabled = this.plugin.settings.floatingOutlineEnabled;
		const hasValidMarkdownView = Boolean(this.activeView && this.activeView.editor && this.activeView.file);
		const hasVisibleItems = this.listEl.querySelector("li") !== null;
		const belowBreakpoint = this.isBelowBreakpoint();
		const hasUnsafeLayout = this.wouldOverlapContentOrOverflow();
		const shouldHide = !enabled || !hasValidMarkdownView || !hasVisibleItems || belowBreakpoint || hasUnsafeLayout;

		this.rootEl.classList.toggle("is-hidden", shouldHide);
	}

	renderList(headings: ParsedHeading[]): void {
		if (!this.listEl) {
			return;
		}

		const previousActiveHeadingId = this.activeHeadingId;
		this.listEl.replaceChildren();
		this.renderedHeadings = headings;
		this.linkByHeadingId.clear();
		this.nodeByHeadingId.clear();
		this.expandedHeadingId = null;
		if (headings.length === 0) {
			this.activeHeadingId = null;
			return;
		}

		const firstLevel = headings[0]?.level ?? 1;
		const levelStack: Array<{ level: number; list: HTMLUListElement; lastItem: HTMLLIElement | null }> = [
			{ level: firstLevel, list: this.listEl, lastItem: null },
		];

		for (const heading of headings) {
			while (levelStack.length > 1 && heading.level < levelStack[levelStack.length - 1]!.level) {
				levelStack.pop();
			}

			let target = levelStack[levelStack.length - 1]!;
			if (heading.level < target.level && levelStack.length === 1) {
				target.level = heading.level;
			}

			while (target.level < heading.level) {
				if (!target.lastItem) {
					break;
				}
				const nestedList = document.createElement("ul");
				target.lastItem.appendChild(nestedList);
				target = { level: target.level + 1, list: nestedList, lastItem: null };
				levelStack.push(target);
			}

			const li = document.createElement("li");
			const link = document.createElement("a");
			link.className = "outline-plus-floating-outline__link";
			link.dataset.headingId = heading.id;
			link.href = "#";
			link.textContent = heading.text;
			link.title = heading.text;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				if (!this.activeView) {
					return;
				}
				void jumpToHeading(this.plugin.app, this.activeView, heading);
			});

			li.appendChild(link);
			this.linkByHeadingId.set(heading.id, link);
			this.nodeByHeadingId.set(heading.id, {
				heading,
				itemEl: li,
				linkEl: link,
				contextualListEl: null,
			});
			target.list.appendChild(li);
			target.lastItem = li;
		}

		if (previousActiveHeadingId) {
			const previousActiveLink = this.linkByHeadingId.get(previousActiveHeadingId);
			if (previousActiveLink) {
				this.activeHeadingId = previousActiveHeadingId;
				previousActiveLink.classList.add("is-active");
				return;
			}
		}

		this.activeHeadingId = null;
	}

	private getActiveMarkdownView(): MarkdownView | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file) {
			return null;
		}
		return view;
	}

	private syncContainer(): void {
		if (!this.rootEl) {
			return;
		}

		const targetContainer = this.activeView ? this.getLeafContainer(this.activeView) : null;
		if (!targetContainer) {
			this.disconnectResizeObserver();
			this.activeLeafContainer = null;
			if (this.rootEl.parentElement) {
				this.rootEl.remove();
			}
			return;
		}

		if (this.rootEl.parentElement !== targetContainer) {
			targetContainer.appendChild(this.rootEl);
		}

		if (this.activeLeafContainer !== targetContainer) {
			this.activeLeafContainer = targetContainer;
			this.connectResizeObserver(targetContainer);
		}
	}

	private applySide(): void {
		if (!this.rootEl) {
			return;
		}

		const side = this.plugin.settings.floatingOutlineSide;
		this.rootEl.classList.toggle("is-left", side === "left");
		this.rootEl.classList.toggle("is-right", side === "right");
	}

	private applyAppearance(): void {
		if (!this.rootEl) {
			return;
		}

		const clamped = Math.max(10, Math.min(100, this.plugin.settings.floatingOutlineOpacity));
		this.rootEl.style.setProperty("--outline-plus-floating-opacity", String(clamped / 100));
	}

	private isBelowBreakpoint(): boolean {
		if (!this.activeLeafContainer || !this.activeView) {
			return false;
		}

		return this.activeLeafContainer.clientWidth < this.plugin.settings.floatingOutlineHideBelowPx;
	}

	private getLeafContainer(view: MarkdownView): HTMLElement {
		return view.containerEl.closest<HTMLElement>(".workspace-leaf") ?? view.containerEl;
	}

	private connectResizeObserver(container: HTMLElement): void {
		this.disconnectResizeObserver();

		this.resizeObserver = new ResizeObserver(() => {
			this.applyAlignmentPosition();
			this.applyVisibility();
		});
		this.resizeObserver.observe(container);
	}

	private syncTrackedScrollListeners(): void {
		const source = this.activeView?.containerEl.querySelector<HTMLElement>(".cm-scroller") ?? null;
		const previewRoot = this.activeView?.previewMode?.containerEl ?? null;
		const preview = previewRoot
			? previewRoot.querySelector<HTMLElement>(".markdown-preview-view") ?? previewRoot
			: null;

		if (this.sourceScrollEl !== source) {
			this.sourceScrollEl?.removeEventListener("scroll", this.onTrackedScroll);
			this.sourceScrollEl = source;
			this.sourceScrollEl?.addEventListener("scroll", this.onTrackedScroll, { passive: true });
		}

		if (this.previewScrollEl !== preview) {
			this.previewScrollEl?.removeEventListener("scroll", this.onTrackedScroll);
			this.previewScrollEl = preview;
			this.previewScrollEl?.addEventListener("scroll", this.onTrackedScroll, { passive: true });
		}
	}

	private disconnectTrackedScrollListeners(): void {
		this.sourceScrollEl?.removeEventListener("scroll", this.onTrackedScroll);
		this.previewScrollEl?.removeEventListener("scroll", this.onTrackedScroll);
		this.sourceScrollEl = null;
		this.previewScrollEl = null;
	}

	private disconnectResizeObserver(): void {
		if (!this.resizeObserver) {
			return;
		}

		this.resizeObserver.disconnect();
		this.resizeObserver = null;
	}

	private updateActiveHeading(): void {
		if (!this.isOutlineVisible()) {
			return;
		}

		if (!this.activeView || this.allHeadings.length === 0 || this.enabledLevels.size === 0) {
			this.applyActiveHeading(null);
			return;
		}

		const activeLine = getActiveDocumentLine(this.activeView, this.allHeadings);
		const activeHeading = activeLine === null
			? null
			: resolveActiveHeadingForLevels(this.allHeadings, activeLine, this.enabledLevels);
		this.applyActiveHeading(activeHeading);
	}

	private applyActiveHeading(heading: ParsedHeading | null): void {
		const nextId = heading?.id ?? null;
		if (this.activeHeadingId === nextId) {
			if (nextId) {
				this.linkByHeadingId.get(nextId)?.classList.add("is-active");
			}
			this.applyContextualChildren(heading);
			return;
		}

		if (this.activeHeadingId) {
			const previousLink = this.linkByHeadingId.get(this.activeHeadingId);
			previousLink?.classList.remove("is-active");
		}

		this.activeHeadingId = nextId;
		if (!nextId) {
			this.applyContextualChildren(null);
			return;
		}

		const link = this.linkByHeadingId.get(nextId);
		if (!link) {
			return;
		}

		link.classList.add("is-active");
		this.applyContextualChildren(heading);
		if (this.isOutlineVisible()) {
			link.scrollIntoView({ block: "nearest", inline: "nearest" });
		}
	}

	private applyContextualChildren(activeHeading: ParsedHeading | null): void {
		if (!this.plugin.settings.floatingOutlineRevealChildren) {
			this.setExpandedHeading(null);
			return;
		}

		const expandableHeading = activeHeading ? this.getExpandableHeading(activeHeading) : null;
		this.setExpandedHeading(expandableHeading);
	}

	private setExpandedHeading(heading: ParsedHeading | null): void {
		const nextId = heading?.id ?? null;
		if (this.expandedHeadingId === nextId) {
			return;
		}

		if (this.expandedHeadingId) {
			this.toggleContextualList(this.expandedHeadingId, false);
		}

		this.expandedHeadingId = nextId;
		if (!nextId) {
			return;
		}

		this.toggleContextualList(nextId, true);
	}

	private toggleContextualList(headingId: string, expanded: boolean): void {
		const node = this.nodeByHeadingId.get(headingId);
		if (!node) {
			return;
		}

		const contextualList = this.ensureContextualList(node);
		if (!contextualList) {
			return;
		}

		node.itemEl.classList.toggle("is-expanded", expanded);
		contextualList.classList.toggle("is-expanded", expanded);
		contextualList.setAttribute("aria-hidden", expanded ? "false" : "true");
	}

	private ensureContextualList(node: RenderedOutlineNode): HTMLUListElement | null {
		if (node.contextualListEl) {
			return node.contextualListEl;
		}

		const children = this.getDirectHiddenChildren(node.heading);
		if (children.length === 0) {
			return null;
		}

		const list = document.createElement("ul");
		list.className = "outline-plus-floating-outline__contextual-list";
		list.setAttribute("aria-hidden", "true");

		for (const child of children) {
			const item = document.createElement("li");
			item.className = "outline-plus-floating-outline__contextual-item";

			const link = document.createElement("a");
			link.className = "outline-plus-floating-outline__link outline-plus-floating-outline__link--contextual";
			link.dataset.headingId = child.id;
			link.href = "#";
			link.textContent = child.text;
			link.title = child.text;
			link.addEventListener("click", (event) => {
				event.preventDefault();
				if (!this.activeView) {
					return;
				}
				void jumpToHeading(this.plugin.app, this.activeView, child);
			});

			item.appendChild(link);
			list.appendChild(item);
		}

		node.itemEl.appendChild(list);
		node.contextualListEl = list;
		return list;
	}

	private getExpandableHeading(activeHeading: ParsedHeading): ParsedHeading | null {
		const visibleChain = this.getVisibleHeadingChain(activeHeading);
		for (const candidate of visibleChain) {
			if (candidate.level >= 6) {
				continue;
			}

			const directChildLevel = (candidate.level + 1) as HeadingLevel;
			if (this.enabledLevels.has(directChildLevel)) {
				continue;
			}

			if (this.getDirectHiddenChildren(candidate).length > 0) {
				return candidate;
			}
		}

		return null;
	}

	private getVisibleHeadingChain(activeHeading: ParsedHeading): ParsedHeading[] {
		const chain: ParsedHeading[] = [];
		let targetLevel = activeHeading.level;

		for (let index = this.allHeadings.findIndex((heading) => heading.id === activeHeading.id); index >= 0; index -= 1) {
			const candidate = this.allHeadings[index];
			if (!candidate || candidate.level > targetLevel) {
				continue;
			}

			if (candidate.id === activeHeading.id || candidate.level < targetLevel) {
				targetLevel = candidate.level;
				if (this.enabledLevels.has(candidate.level)) {
					chain.push(candidate);
				}
				if (targetLevel === 1) {
					break;
				}
			}
		}

		return chain;
	}

	private getDirectHiddenChildren(parent: ParsedHeading): ParsedHeading[] {
		if (parent.level >= 6) {
			return [];
		}

		const childLevel = (parent.level + 1) as HeadingLevel;
		if (this.enabledLevels.has(childLevel)) {
			return [];
		}

		const parentIndex = this.allHeadings.findIndex((heading) => heading.id === parent.id);
		if (parentIndex < 0) {
			return [];
		}

		const children: ParsedHeading[] = [];
		for (let index = parentIndex + 1; index < this.allHeadings.length; index += 1) {
			const candidate = this.allHeadings[index];
			if (!candidate) {
				continue;
			}

			if (candidate.level <= parent.level) {
				break;
			}

			if (candidate.level === childLevel) {
				children.push(candidate);
			}
		}

		return children;
	}

	private isOutlineVisible(): boolean {
		if (!this.rootEl) {
			return false;
		}

		return !this.rootEl.classList.contains("is-hidden");
	}

	private applyAlignmentPosition(): void {
		if (!this.rootEl) {
			return;
		}

		const side = this.plugin.settings.floatingOutlineSide;
		const alignment = this.plugin.settings.floatingOutlineAlignment;
		const edgeOffset = 12;
		const contentGap = 12;

		this.rootEl.setCssProps({ left: "", right: "" });

		if (alignment === "to-content") {
			const contentAnchor = this.getContentAnchorElement();
			if (contentAnchor && this.activeLeafContainer) {
				const leafRect = this.activeLeafContainer.getBoundingClientRect();
				const contentRect = contentAnchor.getBoundingClientRect();

					if (side === "right") {
						const left = Math.max(edgeOffset, Math.round(contentRect.right - leafRect.left + contentGap));
						this.rootEl.setCssProps({ left: `${left}px`, right: "" });
						return;
					}

					const right = Math.max(edgeOffset, Math.round(leafRect.right - contentRect.left + contentGap));
					this.rootEl.setCssProps({ left: "", right: `${right}px` });
					return;
				}
			}

			if (side === "right") {
				this.rootEl.setCssProps({ left: "", right: `${edgeOffset}px` });
				return;
			}

			this.rootEl.setCssProps({ left: `${edgeOffset}px`, right: "" });
		}

	private getContentAnchorElement(): HTMLElement | null {
		if (!this.activeView) {
			return null;
		}

		const candidates = [
			".markdown-source-view.mod-cm6 .cm-contentContainer",
			".markdown-source-view.mod-cm6 .cm-content",
			".markdown-preview-view .markdown-preview-sizer",
			".markdown-reading-view .markdown-preview-sizer",
			".markdown-preview-sizer",
		];

		for (const selector of candidates) {
			const element = this.activeView.containerEl.querySelector<HTMLElement>(selector);
			if (!element) {
				continue;
			}

			const rect = element.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				return element;
			}
		}

		return null;
	}

	private wouldOverlapContentOrOverflow(): boolean {
		if (!this.rootEl || !this.activeLeafContainer || !this.activeView) {
			return false;
		}

		const side = this.plugin.settings.floatingOutlineSide;
		const minGap = 10;
		const width = this.rootEl.offsetWidth;
		if (width <= 0) {
			return false;
		}

		const leafRect = this.activeLeafContainer.getBoundingClientRect();
		const leafWidth = this.activeLeafContainer.clientWidth;
		if (leafWidth <= 0) {
			return false;
		}

		const leftStyle = this.rootEl.style.left;
		const rightStyle = this.rootEl.style.right;
		const leftOffset = leftStyle ? Number.parseFloat(leftStyle) : Number.NaN;
		const rightOffset = rightStyle ? Number.parseFloat(rightStyle) : Number.NaN;

		let left = 0;
		if (Number.isFinite(leftOffset)) {
			left = leftOffset;
		} else if (Number.isFinite(rightOffset)) {
			left = leafWidth - rightOffset - width;
		} else {
			left = this.rootEl.offsetLeft;
		}

		const right = left + width;
		if (left < 0 || right > leafWidth) {
			return true;
		}

		const contentAnchor = this.getContentAnchorElement();
		if (!contentAnchor) {
			return false;
		}

		const contentRect = contentAnchor.getBoundingClientRect();
		const contentLeft = contentRect.left - leafRect.left;
		const contentRight = contentRect.right - leafRect.left;

		if (side === "right") {
			const overlaps = left < contentRight + minGap;
			return overlaps;
		}

		const overlaps = right > contentLeft - minGap;
		return overlaps;
	}

}
