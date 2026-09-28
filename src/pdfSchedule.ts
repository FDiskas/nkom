// Some waste-collector uploads only ship the quarterly schedule as a PDF
// (no XLSX sibling). These PDFs are Google Sheets exports that draw an actual
// vector table grid, so we rebuild the same row/column structure XLSX gives
// us by clustering text against that grid, rather than parsing free text.

import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

type CellValue = string | number | null | undefined;

// [a, b, c, d, e, f] — standard PDF affine transform matrix.
type Mat = [number, number, number, number, number, number];
const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

// Grid line positions within GRID_TOLERANCE points are treated as fragments
// of the same drawn line (grid lines are jittery, but genuine columns are at
// least tens of points apart, so this stays tight).
const GRID_TOLERANCE = 1;
// A glyph's x-position can sit a few points inside its cell's left edge
// (text padding), so column matching needs a looser tolerance than line
// clustering — otherwise text flush against a boundary falls outside every
// column and gets dropped.
const CELL_INSET_TOLERANCE = 5;
// A line must span at least this fraction of the longest line on its axis to
// count as a table boundary (filters out underlines, cell-shading borders).
const MIN_GRID_LINE_SHARE = 0.85;
// Path fill ops (OPS.fill, OPS.eoFill) draw cell-shading rectangles that share
// grid coordinates but aren't lines; only stroked paths outline the table.
const STROKE_OPS = new Set([
	OPS.stroke,
	OPS.closeStroke,
	OPS.fillStroke,
	OPS.eoFillStroke,
	OPS.closeFillStroke,
	OPS.closeEOFillStroke,
]);

export async function readPdfScheduleRows(
	bytes: Uint8Array,
): Promise<CellValue[][]> {
	const loadingTask = getDocument({
		data: bytes,
		disableFontFace: true,
		useSystemFonts: false,
	});

	try {
		const doc = await loadingTask.promise;
		const rows: CellValue[][] = [];
		let carryOpenVietove = false;
		for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
			const page = await doc.getPage(pageNumber);
			const { rows: pageRows, leadingContinuation, endsOpen } = await extractPageRows(
				page,
				pageNumber === 1,
				carryOpenVietove,
			);

			const previousRow = rows[rows.length - 1];
			if (leadingContinuation && previousRow) {
				previousRow[VIETOVE_COLUMN] = previousRow[VIETOVE_COLUMN]
					? `${previousRow[VIETOVE_COLUMN]} ${leadingContinuation}`
					: leadingContinuation;
			}

			rows.push(...pageRows);
			carryOpenVietove = endsOpen;
		}
		return rows;
	} finally {
		await loadingTask.destroy();
	}
}

// Two columns wrap across several physical text lines on their own: Vietovė
// (locality list, always the widest column) and Sav. diena (collection
// frequency, e.g. "Kas antrą" / "trečiadienį" on separate lines). Neither
// wrapping is tied to the row's other columns (Seniūnija, the day columns,
// Maršrutas), which end up vertically centered within the wrapped block
// rather than pinned to its first or last line. So rows aren't reconstructed
// by closing out at the first line with non-Vietovė content — a Sav. diena
// fragment can appear alone, floating anywhere near a row without marking
// its start. Instead every "anchor" line (content in Seniūnija or the
// day/route columns) seeds a row, and every wrap-only line — Vietovė or
// Sav. diena — is folded into whichever anchor is vertically closest to it.
const VIETOVE_COLUMN = 1;
const WRAP_ONLY_COLUMNS = new Set([VIETOVE_COLUMN, 2]); // Vietovė, Sav. diena
// Seniūnija (column 0) never wraps and is always present on a genuine row,
// so it doubles as that row's identity: a second anchor line that supplies
// its own Seniūnija can't be a continuation of the row already accumulating
// (that row already has one), even when the two lines are physically
// adjacent — see the block-forming loop in groupLinesIntoRows.
const ROW_IDENTITY_COLUMN = 0;
// Physical text lines within LINE_TOLERANCE points of each other's baseline
// are the same line (glyph baselines jitter slightly within one line, but
// this must stay well under the ~14pt row line-height used in these exports).
const LINE_TOLERANCE = 3;

export type Item = { column: number; x: number; y: number; str: string };

type PageExtractionResult = {
	rows: string[][];
	leadingContinuation: string;
	endsOpen: boolean;
};

async function extractPageRows(
	page: PDFPageProxy,
	isFirstPage: boolean,
	carryOpenVietove: boolean,
): Promise<PageExtractionResult> {
	const columnBounds = await extractColumnBounds(page);
	if (columnBounds.length < 2) {
		return { rows: [], leadingContinuation: "", endsOpen: false };
	}
	const columnCount = columnBounds.length - 1;

	const textContent = await page.getTextContent();
	const items: Item[] = [];

	for (const entry of textContent.items) {
		if (!("str" in entry)) {
			continue;
		}
		const str = entry.str.trim();
		if (!str) {
			continue;
		}

		const [, , , , x, y] = entry.transform;
		// pdf.js merges a whole run of same-styled text into one item, so a
		// wrapped locality line is often a single item spanning most of the
		// Vietovė column's width. Bucketing on its start x can land it a column
		// early when that start sits a few points left of the true boundary
		// (e.g. an empty neighboring cell shifts where the run begins); the
		// item's horizontal center is a much more reliable placement.
		const centerX = x + ("width" in entry ? entry.width / 2 : 0);
		const column = bandIndex(columnBounds, centerX);
		if (column === -1) {
			continue;
		}

		items.push({ column, x, y, str });
	}

	// Top to bottom, then left to right within a line.
	items.sort((a, b) => b.y - a.y || a.x - b.x);

	const lines: Item[][] = [];
	for (const item of items) {
		const currentLine = lines[lines.length - 1];
		const anchor = currentLine?.[0];
		if (
			currentLine &&
			anchor &&
			Math.abs(anchor.y - item.y) <= LINE_TOLERANCE
		) {
			currentLine.push(item);
		} else {
			lines.push([item]);
		}
	}

	const { rows, leadingContinuation } = buildRows(
		lines,
		columnCount,
		isFirstPage,
		carryOpenVietove,
	);
	return { rows, leadingContinuation, endsOpen: endsWithOpenVietove(rows) };
}

// Groups physical lines into logical rows: a line with content outside the
// wrap-only columns seeds a row ("anchor"); every wrap-only line (Vietovė or
// Sav. diena) is then folded into whichever anchor block it belongs to. See
// buildAnchorBlocks and assignWrapLines for how each half works.
export function groupLinesIntoRows(
	lines: Item[][],
	columnCount: number,
	isFirstPage: boolean,
	carryOpenVietove = false,
): string[][] {
	return buildRows(lines, columnCount, isFirstPage, carryOpenVietove).rows;
}

function buildRows(
	lines: Item[][],
	columnCount: number,
	isFirstPage: boolean,
	carryOpenVietove: boolean,
): { rows: string[][]; leadingContinuation: string } {
	const isAnchor = lines.map((line) =>
		line.some((item) => !WRAP_ONLY_COLUMNS.has(item.column)),
	);
	const hasRowIdentity = lines.map((line) =>
		line.some((item) => item.column === ROW_IDENTITY_COLUMN),
	);

	const blocks = buildAnchorBlocks(isAnchor, hasRowIdentity);
	if (!blocks.length) {
		return { rows: [], leadingContinuation: "" };
	}

	const firstAnchorLine = blocks[0]?.[0] ?? 0;

	// A Vietovė street list left with an unclosed "(" at the end of the
	// previous page continues here, before this page's own first anchor —
	// fold it onto the previous page's last row instead of onto this page's
	// first row (see endsWithOpenVietove and the readPdfScheduleRows loop).
	let leadingContinuation = "";
	let continuationScanEnd = 0;
	if (carryOpenVietove) {
		let balance = 1;
		for (let i = 0; i < firstAnchorLine; i++) {
			const text = localityText(lines[i]);
			if (!text) {
				break;
			}
			leadingContinuation = leadingContinuation
				? `${leadingContinuation} ${text}`
				: text;
			balance += parenBalanceDelta(text);
			continuationScanEnd = i + 1;
			if (balance <= 0) {
				break;
			}
		}
	}

	const leadingOrphans = isFirstPage
		? range(continuationScanEnd, firstAnchorLine).filter((i) => !isAnchor[i])
		: [];
	const wrapScanStart = isFirstPage ? firstAnchorLine : continuationScanEnd;

	const rowLineIndices = assignWrapLines(lines, blocks, isAnchor, wrapScanStart);

	const allRowIndices = leadingOrphans.length
		? [leadingOrphans, ...rowLineIndices]
		: rowLineIndices;

	const rows = allRowIndices.map((indices) =>
		mergeLines(
			indices
				.sort((a, b) => a - b)
				.map((i) => lines[i])
				.filter((line): line is Item[] => line !== undefined),
			columnCount,
		),
	);

	return { rows, leadingContinuation };
}

// Consecutive anchor lines form one row together — unless the later one
// carries its own Seniūnija (row identity) while the block already has one,
// which means it's a second, unwrapped row that merely happens to sit right
// after the first with no wrap-only line between them to separate them (e.g.
// two back-to-back rows whose Vietovė/Sav. diena each fit on a single line).
function buildAnchorBlocks(
	isAnchor: boolean[],
	hasRowIdentity: boolean[],
): number[][] {
	const blocks: number[][] = [];
	for (let i = 0; i < isAnchor.length; i++) {
		if (!isAnchor[i]) {
			continue;
		}
		const previousBlock = blocks[blocks.length - 1];
		const isAdjacent =
			previousBlock !== undefined &&
			previousBlock[previousBlock.length - 1] === i - 1;
		const startsNewRow =
			hasRowIdentity[i] && previousBlock?.some((j) => hasRowIdentity[j]);
		if (previousBlock && isAdjacent && !startsNewRow) {
			previousBlock.push(i);
		} else {
			blocks.push([i]);
		}
	}
	return blocks;
}

const MAX_OPEN_BLOCK_ANCHOR_SPAN = 1;

// Every wrap-only line (Vietovė or Sav. diena) is folded into whichever row's
// anchor lines are vertically nearest to it, since those wraps can run both
// before and after a row's anchor lines.
//
// A wrapped Vietovė street list can leave an unmatched "(" on one physical
// line, with its closing ")" landing on a later line that — because
// Vietovė wraps independently of the row's other columns — can sit
// vertically closer to the NEXT row's anchor than to its own. Track each
// row's running paren balance while scanning top to bottom, and pin a
// Vietovė line to the row still waiting on a closing paren instead of
// trusting y-distance for it.
//
// Source PDFs aren't guaranteed to be well-formed, though — a genuinely
// unclosed "(" (a typo in the schedule itself) must not hold a block open
// for the rest of the document, silently swallowing every later row's
// Vietovė text into it. The wrap-past-the-next-anchor case this exists
// for only ever needs to survive crossing ONE other row's anchor line, so
// once a second anchor goes by with the paren still open, give up on it
// and fall back to plain y-distance for whatever follows.
function assignWrapLines(
	lines: Item[][],
	blocks: number[][],
	isAnchor: boolean[],
	wrapScanStart: number,
): number[][] {
	const lineY = lines.map(averageY);
	const blockY = blocks.map(averageOf(lineY));
	const rowLineIndices = blocks.map((block) => [...block]);

	const lineToBlock = new Map<number, number>();
	blocks.forEach((block, blockIndex) => {
		for (const i of block) {
			lineToBlock.set(i, blockIndex);
		}
	});

	const blockParenBalance: number[] = blocks.map(() => 0);
	let openBlock: number | null = null;
	let anchorsSinceOpen = 0;

	for (let i = wrapScanStart; i < lines.length; i++) {
		const localityDelta = parenBalanceDelta(localityText(lines[i]));

		if (isAnchor[i]) {
			if (openBlock !== null) {
				anchorsSinceOpen++;
				if (anchorsSinceOpen > MAX_OPEN_BLOCK_ANCHOR_SPAN) {
					openBlock = null;
					anchorsSinceOpen = 0;
				}
			}

			const blockIndex = lineToBlock.get(i);
			if (blockIndex !== undefined && localityDelta !== 0) {
				blockParenBalance[blockIndex] =
					(blockParenBalance[blockIndex] ?? 0) + localityDelta;
				if ((blockParenBalance[blockIndex] ?? 0) > 0) {
					openBlock = blockIndex;
					anchorsSinceOpen = 0;
				} else if (openBlock === blockIndex) {
					openBlock = null;
				}
			}
			continue;
		}

		const isVietoveLine = lines[i]?.some(
			(item) => item.column === VIETOVE_COLUMN,
		);
		const target: number =
			isVietoveLine && openBlock !== null
				? openBlock
				: closestIndex(blockY, lineY[i] ?? 0);

		rowLineIndices[target]?.push(i);

		if (isVietoveLine) {
			blockParenBalance[target] = (blockParenBalance[target] ?? 0) + localityDelta;
			if ((blockParenBalance[target] ?? 0) > 0) {
				openBlock = target;
				anchorsSinceOpen = 0;
			} else {
				openBlock = null;
			}
		}
	}

	return rowLineIndices;
}

function range(start: number, endExclusive: number): number[] {
	return Array.from(
		{ length: Math.max(0, endExclusive - start) },
		(_, i) => start + i,
	);
}

function averageY(line: Item[]): number {
	return line.reduce((sum, item) => sum + item.y, 0) / line.length;
}

function localityText(line: Item[] | undefined): string {
	return (line ?? [])
		.filter((item) => item.column === VIETOVE_COLUMN)
		.map((item) => item.str)
		.join(" ");
}

function parenBalanceDelta(text: string): number {
	let balance = 0;
	for (const char of text) {
		if (char === "(") {
			balance++;
		} else if (char === ")") {
			balance--;
		}
	}
	return balance;
}

function endsWithOpenVietove(rows: string[][]): boolean {
	const lastRow = rows[rows.length - 1];
	return parenBalanceDelta(lastRow?.[VIETOVE_COLUMN] ?? "") > 0;
}

function averageOf(values: number[]): (indices: number[]) => number {
	return (indices) =>
		indices.reduce((sum, i) => sum + (values[i] ?? 0), 0) / indices.length;
}

function closestIndex(values: number[], target: number): number {
	let closest = 0;
	let closestDistance = Number.POSITIVE_INFINITY;
	for (let i = 0; i < values.length; i++) {
		const distance = Math.abs((values[i] ?? 0) - target);
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = i;
		}
	}
	return closest;
}

function mergeLines(lines: Item[][], columnCount: number): string[] {
	const columns: string[] = Array.from({ length: columnCount }, () => "");
	for (const line of lines) {
		for (const item of line) {
			columns[item.column] = columns[item.column]
				? `${columns[item.column]} ${item.str}`
				: item.str;
		}
	}
	return columns;
}

type Segment = { position: number; from: number; to: number };

async function extractColumnBounds(page: PDFPageProxy): Promise<number[]> {
	const opList = await page.getOperatorList();

	const verticals: Segment[] = [];

	let ctm: Mat = IDENTITY;
	const ctmStack: Mat[] = [];

	for (let i = 0; i < opList.fnArray.length; i++) {
		const fn = opList.fnArray[i];
		const args = opList.argsArray[i];

		if (fn === OPS.save) {
			ctmStack.push(ctm);
		} else if (fn === OPS.restore) {
			ctm = ctmStack.pop() ?? IDENTITY;
		} else if (fn === OPS.transform) {
			ctm = multiplyMat(ctm, args as Mat);
		} else if (fn === OPS.constructPath) {
			const [drawOp] = args as [number, [Float32Array | null]];
			// Only stroked paths are grid lines; filled cell-shading rectangles
			// (zebra striping, merged-group highlights) draw the same rectangle
			// shape but must not be mistaken for a column boundary.
			if (STROKE_OPS.has(drawOp)) {
				collectVerticalLines(
					args as [number, [Float32Array | null]],
					ctm,
					verticals,
				);
			}
		}
	}

	return primaryLinePositions(verticals);
}

function collectVerticalLines(
	args: [number, [Float32Array | null]],
	ctm: Mat,
	verticals: Segment[],
): void {
	const [, [buffer]] = args;
	if (!buffer) {
		return;
	}

	let cursor: [number, number] | null = null;
	let k = 0;
	while (k < buffer.length) {
		const op = buffer[k++];
		if (op === 0 /* moveTo */) {
			cursor = applyMat(ctm, buffer[k] ?? 0, buffer[k + 1] ?? 0);
			k += 2;
		} else if (op === 1 /* lineTo */) {
			const next = applyMat(ctm, buffer[k] ?? 0, buffer[k + 1] ?? 0);
			k += 2;
			if (cursor) {
				const [x1, y1] = cursor;
				const [x2, y2] = next;
				if (Math.abs(x1 - x2) < 0.05 && Math.abs(y1 - y2) > 1) {
					verticals.push({
						position: x1,
						from: Math.min(y1, y2),
						to: Math.max(y1, y2),
					});
				}
			}
			cursor = next;
		} else if (op === 2 /* curveTo */) {
			cursor = applyMat(ctm, buffer[k + 4] ?? 0, buffer[k + 5] ?? 0);
			k += 6;
		} else if (op === 3 /* quadraticCurveTo */) {
			cursor = applyMat(ctm, buffer[k + 2] ?? 0, buffer[k + 3] ?? 0);
			k += 4;
		}
		// closePath (op === 4) carries no coordinates.
	}
}

// Table grid lines are often drawn as several collinear segments (e.g. one
// per cell) rather than a single stroke spanning the whole row/column. Group
// segments whose position is within tolerance first, then measure each
// group's union extent — that's what tells a full grid line apart from a
// short decorative one (cell shading border, text underline, ...).
function primaryLinePositions(segments: Segment[]): number[] {
	if (!segments.length) {
		return [];
	}

	const sorted = [...segments].sort((a, b) => a.position - b.position);
	const groups: Array<{ positions: number[]; from: number; to: number }> = [];

	for (const segment of sorted) {
		const group = groups[groups.length - 1];
		const lastPosition = group?.positions[group.positions.length - 1];
		if (
			group &&
			lastPosition !== undefined &&
			segment.position - lastPosition <= GRID_TOLERANCE
		) {
			group.positions.push(segment.position);
			group.from = Math.min(group.from, segment.from);
			group.to = Math.max(group.to, segment.to);
		} else {
			groups.push({
				positions: [segment.position],
				from: segment.from,
				to: segment.to,
			});
		}
	}

	const maxCoverage = Math.max(...groups.map((g) => g.to - g.from));
	return groups
		.filter((g) => g.to - g.from >= maxCoverage * MIN_GRID_LINE_SHARE)
		.map((g) => g.positions.reduce((sum, p) => sum + p, 0) / g.positions.length)
		.sort((a, b) => a - b);
}

// `bounds` are ascending x-coordinates in PDF user space; returns which
// column band `value` falls into, or -1 if it's outside the table.
//
// A value sitting almost exactly on a boundary (e.g. text starting a
// fraction of a point past a grid line) must resolve to the column it's
// actually inside, not whichever neighbor's tolerance reaches it first — so
// exact containment is tried before any tolerance is applied. Only once
// nothing contains it do we allow the outer table edges (where a cell's
// first glyph can sit a few points in from its left border, with no
// neighboring column to be confused with) to claim it.
function bandIndex(bounds: number[], value: number): number {
	for (let i = 0; i < bounds.length - 1; i++) {
		const lo = bounds[i];
		const hi = bounds[i + 1];
		if (lo !== undefined && hi !== undefined && value >= lo && value <= hi) {
			return i;
		}
	}

	const first = bounds[0];
	if (
		first !== undefined &&
		value < first &&
		value >= first - CELL_INSET_TOLERANCE
	) {
		return 0;
	}
	const last = bounds[bounds.length - 1];
	if (
		last !== undefined &&
		value > last &&
		value <= last + CELL_INSET_TOLERANCE
	) {
		return bounds.length - 2;
	}
	return -1;
}

function multiplyMat(m1: Mat, m2: Mat): Mat {
	return [
		m1[0] * m2[0] + m1[1] * m2[2],
		m1[0] * m2[1] + m1[1] * m2[3],
		m1[2] * m2[0] + m1[3] * m2[2],
		m1[2] * m2[1] + m1[3] * m2[3],
		m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
		m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
	];
}

function applyMat(m: Mat, x: number, y: number): [number, number] {
	return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
