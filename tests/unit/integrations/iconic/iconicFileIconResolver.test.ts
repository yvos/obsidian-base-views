import { App } from "obsidian";
import { resolveIconicFileIcon } from "../../../../src/integrations/iconic/iconicFileIconResolver";

const FILE_PATH = "TaskNotes/Test.md";

function createAppWithGetPlugin(plugin: unknown): App {
	return {
		plugins: {
			getPlugin: jest.fn((id: string) => (id === "iconic" ? plugin : null)),
		},
	} as unknown as App;
}

function createAppWithPluginRecord(plugin: unknown): App {
	return {
		plugins: {
			plugins: {
				iconic: plugin,
			},
		},
	} as unknown as App;
}

describe("resolveIconicFileIcon", () => {
	it("prioritizes rule icon over file item and settings", () => {
		const checkRuling = jest.fn(() => ({ icon: "lucide-star", color: "yellow" }));
		const getFileItem = jest.fn(() => ({ icon: "lucide-file", color: "blue" }));
		const app = createAppWithGetPlugin({
			ruleManager: { checkRuling },
			getFileItem,
			settings: {
				fileIcons: {
					[FILE_PATH]: { icon: "lucide-book", color: "green" },
				},
			},
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-star",
			color: "yellow",
		});
		expect(checkRuling).toHaveBeenCalledWith("file", FILE_PATH);
		expect(getFileItem).not.toHaveBeenCalled();
	});

	it("falls back to getFileItem when rule has no icon", () => {
		const app = createAppWithGetPlugin({
			ruleManager: {
				checkRuling: jest.fn(() => ({ color: "red" })),
			},
			getFileItem: jest.fn(() => ({ icon: "lucide-file-text", color: "orange" })),
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-file-text",
			color: "orange",
		});
	});

	it("falls back to settings.fileIcons when getFileItem throws", () => {
		const app = createAppWithGetPlugin({
			ruleManager: {
				checkRuling: jest.fn(() => null),
			},
			getFileItem: jest.fn(() => {
				throw new Error("iconic failure");
			}),
			settings: {
				fileIcons: {
					[FILE_PATH]: { icon: "lucide-folder", color: "cyan" },
				},
			},
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-folder",
			color: "cyan",
		});
	});

	it("continues fallback when ruleManager throws", () => {
		const app = createAppWithGetPlugin({
			ruleManager: {
				checkRuling: jest.fn(() => {
					throw new Error("rule failure");
				}),
			},
			getFileItem: jest.fn(() => ({ icon: "lucide-circle", color: "purple" })),
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-circle",
			color: "purple",
		});
	});

	it("supports plugin record fallback when getPlugin is unavailable", () => {
		const app = createAppWithPluginRecord({
			getFileItem: jest.fn(() => ({ icon: "lucide-notebook-pen", color: "blue" })),
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-notebook-pen",
			color: "blue",
		});
	});

	it("returns null when plugin is missing", () => {
		const app = createAppWithGetPlugin(null);
		expect(resolveIconicFileIcon(app, FILE_PATH)).toBeNull();
	});

	it("returns null for color-only results", () => {
		const app = createAppWithGetPlugin({
			ruleManager: {
				checkRuling: jest.fn(() => ({ color: "red" })),
			},
			getFileItem: jest.fn(() => ({ color: "blue" })),
			settings: {
				fileIcons: {
					[FILE_PATH]: { icon: "", color: "green" },
				},
			},
		});

		expect(resolveIconicFileIcon(app, FILE_PATH)).toBeNull();
	});

	it("calls getFileItem(path, false) when method expects includeDefault", () => {
		const getFileItem = jest.fn(function (_path: string, _includeDefault: boolean) {
			return { icon: "lucide-file", color: "gray" };
		});
		const app = createAppWithGetPlugin({ getFileItem });

		resolveIconicFileIcon(app, FILE_PATH);

		expect(getFileItem).toHaveBeenCalledWith(FILE_PATH, false);
	});

	it("calls getFileItem(path) when method expects one argument", () => {
		const getFileItem = jest.fn(function (_path: string) {
			return { icon: "lucide-book-open", color: "teal" };
		});
		const app = createAppWithGetPlugin({ getFileItem });

		resolveIconicFileIcon(app, FILE_PATH);

		expect(getFileItem).toHaveBeenCalledWith(FILE_PATH);
		expect(getFileItem.mock.calls[0]?.length).toBe(1);
	});

	it("retries alternate getFileItem signature when initial call fails", () => {
		const getFileItem = jest.fn(function (_path: string, includeDefault?: boolean) {
			if (includeDefault === false) throw new Error("unsupported includeDefault");
			return { icon: "lucide-file-check", color: "green" };
		});
		const app = createAppWithGetPlugin({ getFileItem });

		expect(resolveIconicFileIcon(app, FILE_PATH)).toEqual({
			icon: "lucide-file-check",
			color: "green",
		});
		expect(getFileItem).toHaveBeenCalledTimes(2);
		expect(getFileItem.mock.calls[0]).toEqual([FILE_PATH, false]);
		expect(getFileItem.mock.calls[1]).toEqual([FILE_PATH]);
	});
});
