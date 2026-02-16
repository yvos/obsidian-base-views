import {
	formatGroupTitleWithProperty,
	normalizeIconicLucideIconName,
	resolveIconicFileIcon,
} from "../../../src/bases/customTableDisplayUtils";

describe("normalizeIconicLucideIconName", () => {
	it("strips lucide prefix", () => {
		expect(normalizeIconicLucideIconName("lucide-calendar-days")).toBe("calendar-days");
	});

	it("passes through plain lucide id", () => {
		expect(normalizeIconicLucideIconName("folder-code")).toBe("folder-code");
	});

	it("returns null for emoji", () => {
		expect(normalizeIconicLucideIconName("📄")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(normalizeIconicLucideIconName("  ")).toBeNull();
	});
});

describe("resolveIconicFileIcon", () => {
	it("uses Iconic getFileItem result when available", () => {
		const plugin = {
			getFileItem: jest.fn(() => ({ icon: "lucide-book", color: "blue" })),
			settings: {
				fileIcons: {
					"TaskNotes/Test.md": { icon: "lucide-file", color: "gray" },
				},
			},
		};

		expect(resolveIconicFileIcon(plugin, "TaskNotes/Test.md")).toEqual({
			icon: "lucide-book",
			color: "blue",
		});
	});

	it("falls back to settings.fileIcons when getFileItem does not return icon", () => {
		const plugin = {
			getFileItem: jest.fn(() => ({ icon: "" })),
			settings: {
				fileIcons: {
					"TaskNotes/Test.md": { icon: "lucide-file-search", color: "orange" },
				},
			},
		};

		expect(resolveIconicFileIcon(plugin, "TaskNotes/Test.md")).toEqual({
			icon: "lucide-file-search",
			color: "orange",
		});
	});

	it("falls back to settings when getFileItem throws", () => {
		const plugin = {
			getFileItem: jest.fn(() => {
				throw new Error("iconic failure");
			}),
			settings: {
				fileIcons: {
					"TaskNotes/Test.md": { icon: "lucide-file", color: "gray" },
				},
			},
		};

		expect(resolveIconicFileIcon(plugin, "TaskNotes/Test.md")).toEqual({
			icon: "lucide-file",
			color: "gray",
		});
	});

	it("returns null when icon data is missing", () => {
		const plugin = {
			settings: {
				fileIcons: {},
			},
		};

		expect(resolveIconicFileIcon(plugin, "TaskNotes/Test.md")).toBeNull();
	});
});

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
});
