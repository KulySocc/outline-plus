import { getFrontMatterInfo } from "obsidian";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface ParsedHeading {
	id: string;
	text: string;
	level: HeadingLevel;
	line: number;
	offset: number;
	matchText: string;
}

const ATX_HEADING = /^\s{0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$/;
const FENCE_MARKER = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

type FenceState = {
	marker: "`" | "~";
	length: number;
} | null;

export function parseHeadings(markdown: string): ParsedHeading[] {
	const frontmatter = getFrontMatterInfo(markdown);
	const contentStart = frontmatter.exists ? frontmatter.contentStart : 0;
	const preContent = markdown.slice(0, contentStart);
	const content = markdown.slice(contentStart);

	const baseLine = countNewlines(preContent);
	const lines = content.split("\n");
	const localLineStarts = computeLineStarts(content, lines.length);

	const headings: ParsedHeading[] = [];
	const idCounts = new Map<string, number>();
	let activeFence: FenceState = null;

	for (let localLineIndex = 0; localLineIndex < lines.length; localLineIndex += 1) {
		const line = normalizeLine(lines[localLineIndex] ?? "");
		activeFence = updateFenceState(activeFence, line);
		if (activeFence) {
			continue;
		}

		const atxHeading = parseAtxHeading(line);
		if (atxHeading) {
			const lineNumber = baseLine + localLineIndex;
			const offset = contentStart + (localLineStarts[localLineIndex] ?? 0);
			headings.push(makeHeading(atxHeading.text, atxHeading.level, lineNumber, offset, idCounts));
		}
	}

	return headings;
}

export function filterHeadingsByLevels(
	headings: ParsedHeading[],
	enabledLevels: Set<HeadingLevel>,
): ParsedHeading[] {
	return headings.filter((heading) => enabledLevels.has(heading.level));
}

export function searchHeadings(headings: ParsedHeading[], query: string): ParsedHeading[] {
	const normalizedQuery = normalizeQuery(query);
	if (!normalizedQuery) {
		return headings;
	}

	return headings
		.map((heading, sourceIndex) => {
			const matchIndex = heading.matchText.indexOf(normalizedQuery);
			if (matchIndex < 0) {
				return null;
			}

			const prefixPenalty = matchIndex === 0 ? 0 : 1000;
			const score = prefixPenalty + matchIndex * 10 + heading.matchText.length;
			return { heading, sourceIndex, score };
		})
		.filter((value): value is { heading: ParsedHeading; sourceIndex: number; score: number } => value !== null)
		.sort((a, b) => {
			if (a.score !== b.score) {
				return a.score - b.score;
			}
			return a.sourceIndex - b.sourceIndex;
		})
		.map((entry) => entry.heading);
}

function makeHeading(
	text: string,
	level: HeadingLevel,
	line: number,
	offset: number,
	idCounts: Map<string, number>,
): ParsedHeading {
	// Keep IDs stable while typing heading text on the same line.
	const baseId = `h${level}-l${line}`;
	const seenCount = (idCounts.get(baseId) ?? 0) + 1;
	idCounts.set(baseId, seenCount);

	const id = seenCount === 1 ? baseId : `${baseId}-${seenCount}`;

	return {
		id,
		text,
		level,
		line,
		offset,
		matchText: normalizeQuery(text),
	};
}

function computeLineStarts(content: string, lineCount: number): number[] {
	const starts = Array.from({ length: lineCount }, () => 0);
	let currentLine = 0;

	for (let index = 0; index < content.length && currentLine + 1 < lineCount; index += 1) {
		if (content[index] === "\n") {
			currentLine += 1;
			starts[currentLine] = index + 1;
		}
	}

	return starts;
}

function cleanHeadingText(value: string): string {
	return value.trim();
}

function normalizeLine(value: string): string {
	return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function normalizeQuery(value: string): string {
	return value.trim().toLocaleLowerCase();
}

function parseAtxHeading(line: string): { text: string; level: HeadingLevel } | null {
	const atxMatch = line.match(ATX_HEADING);
	if (!atxMatch) {
		return null;
	}

	const markerGroup = atxMatch[1];
	const textGroup = atxMatch[2];
	if (!markerGroup || !textGroup) {
		return null;
	}

	const headingText = cleanHeadingText(textGroup);
	if (!headingText) {
		return null;
	}

	return {
		text: headingText,
		level: markerGroup.length as HeadingLevel,
	};
}

function updateFenceState(current: FenceState, line: string): FenceState {
	if (current) {
		if (isFenceClose(line, current.marker, current.length)) {
			return null;
		}
		return current;
	}

	const opened = parseFenceOpen(line);
	return opened ?? null;
}

function parseFenceOpen(line: string): FenceState {
	const match = line.match(FENCE_MARKER);
	if (!match) {
		return null;
	}

	const markerRun = match[1];
	if (!markerRun) {
		return null;
	}

	const marker = markerRun[0];
	if (marker !== "`" && marker !== "~") {
		return null;
	}

	return {
		marker,
		length: markerRun.length,
	};
}

function isFenceClose(line: string, marker: "`" | "~", minLength: number): boolean {
	const escapedMarker = marker === "`" ? "\\`" : "~";
	const closeRegex = new RegExp(`^\\s{0,3}${escapedMarker}{${minLength},}[ \\t]*$`);
	return closeRegex.test(line);
}

function countNewlines(value: string): number {
	let count = 0;
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] === "\n") {
			count += 1;
		}
	}
	return count;
}
