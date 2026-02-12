import { calculateSummary, getSummaryOptions } from "../../../src/bases/tableSummary";

describe("tableSummary", () => {
	test("empty / filled / unique summaries", () => {
		const values = [null, "", "alpha", "alpha", "beta", { data: "beta" }];

		expect(calculateSummary(values, "empty")).toBe("2");
		expect(calculateSummary(values, "filled")).toBe("4");
		expect(calculateSummary(values, "unique")).toBe("2");
	});

	test("sum / avg / min / max summaries with mixed number values", () => {
		const values = [10, "20", { data: 30 }, null, "", "invalid"];

		expect(calculateSummary(values, "sum")).toBe("60");
		expect(calculateSummary(values, "avg")).toBe("20");
		expect(calculateSummary(values, "min")).toBe("10");
		expect(calculateSummary(values, "max")).toBe("30");
	});

	test("earliest / latest / range summaries with date strings", () => {
		const values = ["2026-01-03", "2026-01-01", "2026-01-06", null];

		expect(calculateSummary(values, "earliest")).toBe("2026-01-01");
		expect(calculateSummary(values, "latest")).toBe("2026-01-06");
		expect(calculateSummary(values, "range")).toBe("5d");
	});

	test("checked / unchecked summaries with boolean and string values", () => {
		const values = [true, false, "true", "unchecked", "yes", "off", null];

		expect(calculateSummary(values, "checked")).toBe("3");
		expect(calculateSummary(values, "unchecked")).toBe("3");
	});

	test("summary options include type-specific entries", () => {
		const options = getSummaryOptions([1, "2", "2026-01-01", true, null]).map((opt) => opt.key);

		expect(options).toEqual(
			expect.arrayContaining([
				"empty",
				"filled",
				"unique",
				"sum",
				"avg",
				"min",
				"max",
				"earliest",
				"latest",
				"range",
				"checked",
				"unchecked",
			])
		);
	});
});
