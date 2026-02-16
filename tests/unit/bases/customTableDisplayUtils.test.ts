import { formatGroupTitleWithProperty } from "../../../src/bases/customTableDisplayUtils";

describe("formatGroupTitleWithProperty", () => {
	it("returns original title when disabled", () => {
		expect(formatGroupTitleWithProperty("Work", "tags", false)).toBe("Work");
	});

	it("formats title as property: value when enabled", () => {
		expect(formatGroupTitleWithProperty("Work", "tags", true)).toBe("tags: Work");
	});

	it("keeps original title if already prefixed", () => {
		expect(formatGroupTitleWithProperty("tags: Work", "tags", true)).toBe("tags: Work");
	});

	it("returns original title when property name is empty", () => {
		expect(formatGroupTitleWithProperty("Work", " ", true)).toBe("Work");
	});
});
