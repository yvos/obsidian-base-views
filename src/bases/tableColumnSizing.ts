export const DEFAULT_TABLE_COLUMN_WIDTH = 160;
export const MIN_TABLE_COLUMN_WIDTH = 96;

// プロパティIDごとの列幅設定マップを表す。
export type ColumnSizeMap = Record<string, number>;

// 列幅を最小値以上の整数に丸めて返す。
export function clampColumnWidth(
	width: number,
	minWidth = MIN_TABLE_COLUMN_WIDTH
): number {
	if (!Number.isFinite(width)) {
		return minWidth;
	}
	return Math.max(minWidth, Math.round(width));
}

// 任意入力を有効な列幅設定マップへ正規化する。
export function normalizeColumnSizeMap(
	value: unknown,
	minWidth = MIN_TABLE_COLUMN_WIDTH
): ColumnSizeMap {
	if (!value || typeof value !== "object") {
		return {};
	}

	const normalized: ColumnSizeMap = {};
	for (const [propertyId, rawWidth] of Object.entries(value as Record<string, unknown>)) {
		if (typeof rawWidth !== "number" || !Number.isFinite(rawWidth)) {
			continue;
		}

		const width = Math.round(rawWidth);
		if (width < minWidth) {
			continue;
		}
		normalized[propertyId] = width;
	}

	return normalized;
}

// 列ID配列に対して保存値または既定値から実際の列幅配列を解決する。
export function resolveColumnWidths(
	columns: string[],
	columnSize: ColumnSizeMap,
	defaultWidth = DEFAULT_TABLE_COLUMN_WIDTH,
	minWidth = MIN_TABLE_COLUMN_WIDTH
): number[] {
	return columns.map((column) => {
		const width = columnSize[column] ?? defaultWidth;
		return clampColumnWidth(width, minWidth);
	});
}

// 列幅配列をCSS grid-template-columns文字列へ変換する。
export function buildColumnTemplateFromWidths(widths: number[]): string {
	if (widths.length === 0) {
		return `${DEFAULT_TABLE_COLUMN_WIDTH}px`;
	}
	return widths.map((width) => `${Math.round(width)}px`).join(" ");
}

// 列幅配列の合計幅を算出する。
export function calcTotalColumnWidth(widths: number[]): number {
	return widths.reduce((sum, width) => sum + Math.max(0, Math.round(width)), 0);
}

// 1列分の幅変更を反映した列幅設定マップを返す。
export function setColumnSizeValue(
	columnSize: ColumnSizeMap,
	propertyId: string,
	width: number,
	defaultWidth = DEFAULT_TABLE_COLUMN_WIDTH,
	minWidth = MIN_TABLE_COLUMN_WIDTH
): ColumnSizeMap {
	const next = { ...columnSize };
	const clampedWidth = clampColumnWidth(width, minWidth);

	if (clampedWidth === defaultWidth) {
		delete next[propertyId];
	} else {
		next[propertyId] = clampedWidth;
	}

	return next;
}
