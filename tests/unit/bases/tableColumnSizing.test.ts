import {
	buildColumnTemplateFromWidths,
	calcTotalColumnWidth,
	clampColumnWidth,
	DEFAULT_TABLE_COLUMN_WIDTH,
	MIN_TABLE_COLUMN_WIDTH,
	normalizeColumnSizeMap,
	resolveColumnWidths,
	setColumnSizeValue,
} from "../../../src/bases/tableColumnSizing";

describe("tableColumnSizing", () => {
	test("列幅正規化: 無効値と最小幅未満を除外する", () => {
		const normalized = normalizeColumnSizeMap({
			"file.name": 220,
			"file.ctime": 95,
			"file.ext": "180",
			"file.folder": NaN,
		});

		expect(normalized).toEqual({
			"file.name": 220,
		});
	});

	test("resolveColumnWidths: 未設定列はデフォルト幅を使い、最小幅でクランプする", () => {
		const widths = resolveColumnWidths(
			["file.name", "file.ctime", "file.ext"],
			{ "file.name": 240, "file.ctime": 40 },
			DEFAULT_TABLE_COLUMN_WIDTH,
			MIN_TABLE_COLUMN_WIDTH
		);

		expect(widths).toEqual([240, MIN_TABLE_COLUMN_WIDTH, DEFAULT_TABLE_COLUMN_WIDTH]);
	});

	test("列幅テンプレートと合計幅を生成できる", () => {
		const widths = [180, 210, 160];
		expect(buildColumnTemplateFromWidths(widths)).toBe("180px 210px 160px");
		expect(calcTotalColumnWidth(widths)).toBe(550);
	});

	test("setColumnSizeValue: デフォルト幅は保存対象から除外する", () => {
		const initial = { "file.name": 220, "file.ctime": 180 };
		const next = setColumnSizeValue(initial, "file.ctime", DEFAULT_TABLE_COLUMN_WIDTH);

		expect(next).toEqual({ "file.name": 220 });
	});

	test("clampColumnWidth: 非数値は最小幅にフォールバックする", () => {
		expect(clampColumnWidth(Number.NaN)).toBe(MIN_TABLE_COLUMN_WIDTH);
		expect(clampColumnWidth(70)).toBe(MIN_TABLE_COLUMN_WIDTH);
		expect(clampColumnWidth(143.2)).toBe(143);
	});
});
