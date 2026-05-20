import {
	formatDateLikeValue,
	getStaticDateDisplayValue,
	isDateLikePropertyId,
} from "../../../src/bases/customTableValueDisplay";

describe("custom table value display", () => {
	describe("isDateLikePropertyId", () => {
		it("detects note date properties", () => {
			expect(isDateLikePropertyId("note.due")).toBe(true);
			expect(isDateLikePropertyId("note.deadline")).toBe(true);
			expect(isDateLikePropertyId("note.startDate")).toBe(true);
			expect(isDateLikePropertyId("formula.dateCreatedDisplay")).toBe(true);
		});

		it("does not treat file properties as date-like", () => {
			expect(isDateLikePropertyId("file.name")).toBe(false);
			expect(isDateLikePropertyId("file.path")).toBe(false);
		});

		it("does not match date-like substrings inside unrelated words", () => {
			expect(isDateLikePropertyId("note.candidate")).toBe(false);
		});
	});

	describe("formatDateLikeValue", () => {
		it("formats ISO dates as dd-mm-yyyy", () => {
			expect(formatDateLikeValue("2026-05-20")).toBe("20-05-2026");
		});

		it("preserves hours and minutes for date-time values", () => {
			expect(formatDateLikeValue("2026-05-20T09:30:00+02:00")).toBe("20-05-2026 09:30");
		});

		it("returns existing display strings unchanged", () => {
			expect(formatDateLikeValue("20-05-2026")).toBe("20-05-2026");
		});
	});

	describe("getStaticDateDisplayValue", () => {
		it("returns formatted text for date-like properties", () => {
			const value = {
				renderTo: jest.fn(),
				toString: () => "2026-05-20",
			};

			expect(getStaticDateDisplayValue("note.due", value)).toBe("20-05-2026");
			expect(value.renderTo).not.toHaveBeenCalled();
		});

		it("does not format non-date properties", () => {
			expect(getStaticDateDisplayValue("note.status", "2026-05-20")).toBeNull();
		});
	});
});
