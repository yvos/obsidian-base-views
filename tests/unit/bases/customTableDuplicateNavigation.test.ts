import {
	buildDuplicateNavigationIndex,
	getNextDuplicateRowOrder,
	hasDuplicateNavigationTarget,
} from "../../../src/bases/customTableDuplicateNavigation";

describe("customTableDuplicateNavigation", () => {
	test("buildDuplicateNavigationIndex: row順で file.path の出現位置を保持する", () => {
		const index = buildDuplicateNavigationIndex([
			"Daily/A.md",
			"Daily/B.md",
			"Daily/A.md",
			"Daily/C.md",
			"Daily/A.md",
			"",
			null,
			undefined,
			"Daily/C.md",
		]);

		expect(index.rowOrdersByPath.get("Daily/A.md")).toEqual([0, 2, 4]);
		expect(index.rowOrdersByPath.get("Daily/B.md")).toEqual([1]);
		expect(index.rowOrdersByPath.get("Daily/C.md")).toEqual([3, 8]);
		expect(index.rowOrdersByPath.has("")).toBe(false);
	});

	test("hasDuplicateNavigationTarget: 2件以上の出現時のみ true", () => {
		const index = buildDuplicateNavigationIndex([
			"Daily/A.md",
			"Daily/B.md",
			"Daily/A.md",
		]);

		expect(hasDuplicateNavigationTarget(index, "Daily/A.md")).toBe(true);
		expect(hasDuplicateNavigationTarget(index, "Daily/B.md")).toBe(false);
		expect(hasDuplicateNavigationTarget(index, "Daily/Unknown.md")).toBe(false);
	});

	test("getNextDuplicateRowOrder: 次の行へ循環ジャンプする", () => {
		const index = buildDuplicateNavigationIndex([
			"Daily/A.md",
			"Daily/B.md",
			"Daily/A.md",
			"Daily/A.md",
		]);

		expect(getNextDuplicateRowOrder(index, "Daily/A.md", 0)).toBe(2);
		expect(getNextDuplicateRowOrder(index, "Daily/A.md", 2)).toBe(3);
		expect(getNextDuplicateRowOrder(index, "Daily/A.md", 3)).toBe(0);
	});

	test("getNextDuplicateRowOrder: current が見つからない場合は先頭を返す", () => {
		const index = buildDuplicateNavigationIndex([
			"Daily/A.md",
			"Daily/B.md",
			"Daily/A.md",
		]);

		expect(getNextDuplicateRowOrder(index, "Daily/A.md", 99)).toBe(0);
		expect(getNextDuplicateRowOrder(index, "Daily/B.md", 1)).toBeNull();
		expect(getNextDuplicateRowOrder(index, "Daily/Unknown.md", 0)).toBeNull();
	});
});
