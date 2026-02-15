import {
	compareGroupKeys,
	extractGroupKeys,
	extractListValues,
	groupEntriesByValue,
	hasAnyMultiValueEntries,
	sortGroupedEntries,
	toGroupKeyString,
} from "../../../src/bases/customTableGrouping";

describe("customTableGrouping", () => {
	test("extractGroupKeys: scalar values are grouped as single key", () => {
		expect(extractGroupKeys("A", { unnest: true })).toEqual(["A"]);
		expect(extractGroupKeys(1, { unnest: true })).toEqual(["1"]);
		expect(extractGroupKeys(false, { unnest: true })).toEqual(["False"]);
		expect(extractGroupKeys(null, { unnest: true })).toEqual(["None"]);
	});

	test("extractGroupKeys: list values are unnested when enabled", () => {
		expect(extractGroupKeys(["A", "B"], { unnest: true })).toEqual(["A", "B"]);
		expect(extractGroupKeys(["A", "A", "B"], { unnest: true })).toEqual(["A", "B"]);
	});

	test("extractGroupKeys: list values are combined when unnest is disabled", () => {
		expect(extractGroupKeys(["A", "B"], { unnest: false })).toEqual(["A, B"]);
		expect(extractGroupKeys([], { unnest: false })).toEqual(["None"]);
	});

	test("extractListValues: supports Bases ListValue-like objects", () => {
		const listLike = {
			length() {
				return 2;
			},
			at(index: number) {
				return index === 0 ? "A" : "B";
			},
		};

		expect(extractListValues(listLike)).toEqual(["A", "B"]);
		expect(extractListValues({ value: ["X", "Y"] })).toEqual(["X", "Y"]);
		expect(extractListValues({ data: ["L1", "L2"] })).toEqual(["L1", "L2"]);
	});

	test("extractGroupKeys: supports Bases Value objects with data list payload", () => {
		const value = {
			data: [{ data: "#DNO" }, { data: "#MNO" }],
		};
		expect(extractGroupKeys(value, { unnest: true })).toEqual(["#DNO", "#MNO"]);
		expect(extractGroupKeys(value, { unnest: false })).toEqual(["#DNO, #MNO"]);
	});

	test("groupEntriesByValue: unnest duplicates entries across multiple groups", () => {
		const entries = [
			{ id: "1", value: ["A", "B"] },
			{ id: "2", value: ["B"] },
		];

		const grouped = groupEntriesByValue(entries, (entry) => entry.value, { unnest: true });

		expect(grouped.map((group) => group.key)).toEqual(["A", "B"]);
		expect(grouped[0].entries.map((entry) => entry.id)).toEqual(["1"]);
		expect(grouped[1].entries.map((entry) => entry.id)).toEqual(["1", "2"]);
	});

	test("hasAnyMultiValueEntries: detects list values", () => {
		const flat = [{ value: "A" }, { value: "B" }];
		const multi = [{ value: "A" }, { value: ["B", "C"] }];

		expect(hasAnyMultiValueEntries(flat, (entry) => entry.value)).toBe(false);
		expect(hasAnyMultiValueEntries(multi, (entry) => entry.value)).toBe(true);
	});

	test("toGroupKeyString: Date-like values are normalized", () => {
		const value = { date: new Date("2026-02-15T12:34:56.000Z") };
		expect(toGroupKeyString(value)).toBe("2026-02-15");
	});

	test("toGroupKeyString: unwraps data payloads", () => {
		expect(toGroupKeyString({ data: "#tag-a" })).toBe("#tag-a");
	});

	test("compareGroupKeys: places None-like values at the end for ASC and DESC", () => {
		expect(compareGroupKeys("None", "A", "ASC")).toBeGreaterThan(0);
		expect(compareGroupKeys("None", "A", "DESC")).toBeGreaterThan(0);
		expect(compareGroupKeys("Unknown", "Z", "ASC")).toBeGreaterThan(0);
		expect(compareGroupKeys("Unknown", "Z", "DESC")).toBeGreaterThan(0);
	});

	test("sortGroupedEntries: sorts by direction while keeping None-like at the end", () => {
		const groups = [
			{ key: "None", entries: [1] },
			{ key: "B", entries: [2] },
			{ key: "A", entries: [3] },
		];

		expect(sortGroupedEntries(groups, "ASC").map((group) => group.key)).toEqual(["A", "B", "None"]);
		expect(sortGroupedEntries(groups, "DESC").map((group) => group.key)).toEqual(["B", "A", "None"]);
	});
});
