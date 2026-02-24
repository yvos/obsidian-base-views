import { TFile, parseYaml } from "obsidian";
import { BaseViewListYamlStore } from "../../../src/bases/BaseViewListYamlStore";

describe("BaseViewListYamlStore", () => {
	let cachedRead: jest.Mock;
	let modify: jest.Mock;
	let store: BaseViewListYamlStore;
	let file: TFile;

	beforeEach(() => {
		cachedRead = jest.fn();
		modify = jest.fn().mockResolvedValue(undefined);
		file = new TFile("Guides/test.base");

		const plugin = {
			app: {
				vault: {
					cachedRead,
					modify,
				},
			},
		};

		store = new BaseViewListYamlStore(plugin as any);
	});

	it("reads formulas.viewListSize ratio from a base file", async () => {
		cachedRead.mockResolvedValue(
			"formulas:\n  viewListSize: \"0.8\"\nviews:\n  - type: table\n    name: Table\n"
		);

		const ratio = await store.getViewListSizeRatio(file);
		expect(ratio).toBe(0.8);
	});

	it("writes rounded formulas.viewListSize ratio", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);

		const updated = await store.setViewListSizeRatio(file, 1.45455);
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalled();

		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.formulas.viewListSize).toBe("1.455");
		expect(typeof parsed.formulas.viewListSize).toBe("string");
	});

	it("removes formulas.viewListSize when ratio is null", async () => {
		cachedRead.mockResolvedValue(
			"formulas:\n  viewListSize: \"0.9\"\nviews:\n  - type: table\n    name: Table\n"
		);

		const updated = await store.setViewListSizeRatio(file, null);
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalled();

		const nextText = modify.mock.calls[0][1] as string;
		expect(nextText).not.toContain("viewListSize");
	});

	it("updates description for the target view", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n    description: Old\n  - type: cards\n    name: Cards\n"
		);

		const updated = await store.updateViewDescription(file, "Table", "New description");
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalled();

		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.views[0].description).toBe("New description");
	});

	it("deletes description when null is provided", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n    description: Old\n  - type: cards\n    name: Cards\n"
		);

		const updated = await store.updateViewDescription(file, "Table", null);
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalled();

		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(typeof parsed.views[0].description).toBe("undefined");
	});

	it("reorders views by provided names", async () => {
		cachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"  - type: cards",
				"    name: Cards",
				"  - type: list",
				"    name: List",
			].join("\n")
		);

		const updated = await store.reorderViews(file, ["Cards", "Table", "List"]);
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalledTimes(1);
		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.views.map((view: any) => view.name)).toEqual(["Cards", "Table", "List"]);
	});

	it("appends unspecified views to the tail when reordering", async () => {
		cachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"  - type: cards",
				"    name: Cards",
				"  - type: list",
				"    name: List",
			].join("\n")
		);

		const updated = await store.reorderViews(file, ["List", "Unknown", "Table"]);
		expect(updated).toBe(true);
		expect(modify).toHaveBeenCalledTimes(1);
		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.views.map((view: any) => view.name)).toEqual(["List", "Table", "Cards"]);
	});

	it("does not rewrite YAML when reorder result is unchanged", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);

		const updated = await store.reorderViews(file, ["Table", "Cards"]);
		expect(updated).toBe(false);
		expect(modify).not.toHaveBeenCalled();
	});

	it("duplicates a view by copying every property except name", async () => {
		cachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"    description: Main table",
				"    filters:",
				"      status: open",
				"  - type: cards",
				"    name: Cards",
				"  - type: list",
				"    name: Table_2",
			].join("\n")
		);

		const duplicatedName = await store.duplicateView(file, "Table");
		expect(duplicatedName).toBe("Table_3");
		expect(modify).toHaveBeenCalledTimes(1);

		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.views.map((view: any) => view.name)).toEqual([
			"Table",
			"Table_3",
			"Cards",
			"Table_2",
		]);
		expect(parsed.views[1].type).toBe("table");
		expect(parsed.views[1].description).toBe("Main table");
		expect(parsed.views[1].filters).toEqual({ status: "open" });
	});

	it("reads view list formula preferences", async () => {
		cachedRead.mockResolvedValue(
			[
				"formulas:",
				"  bvViewListPosition: left",
				"  bvViewListSidePanePosition: none",
				"  bvViewListShowProperty: \"false\"",
				"  bvViewListTopOverflowMode: scroll",
				"views:",
				"  - type: table",
				"    name: Table",
			].join("\n")
		);

		const prefs = await store.getViewListFormulaPrefs(file);
		expect(prefs).toEqual({
			position: "left",
			sidePanePosition: "none",
			showProperty: false,
			topOverflowMode: "scroll",
		});
	});

	it("writes and clears per-context placement formulas", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);

		let updated = await store.setViewListPosition(file, "normal", "none");
		expect(updated).toBe(true);
		let parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.formulas.bvViewListPosition).toBe("none");

		cachedRead.mockResolvedValue(modify.mock.calls[0][1] as string);
		updated = await store.setViewListPosition(file, "sidePane", "top");
		expect(updated).toBe(true);
		parsed = parseYaml(modify.mock.calls[1][1] as string) as any;
		expect(parsed.formulas.bvViewListPosition).toBe("none");
		expect(parsed.formulas.bvViewListSidePanePosition).toBe("top");

		cachedRead.mockResolvedValue(modify.mock.calls[1][1] as string);
		updated = await store.setViewListPosition(file, "normal", null);
		expect(updated).toBe(true);
		parsed = parseYaml(modify.mock.calls[2][1] as string) as any;
		expect(parsed.formulas.bvViewListPosition).toBeUndefined();
		expect(parsed.formulas.bvViewListSidePanePosition).toBe("top");
	});

	it("stores showProperty as YAML string", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n"
		);
		const updated = await store.setViewListShowProperty(file, true);
		expect(updated).toBe(true);
		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.formulas.bvViewListShowProperty).toBe("true");
		expect(typeof parsed.formulas.bvViewListShowProperty).toBe("string");
	});

	it("ignores invalid enum values and falls back to null", async () => {
		cachedRead.mockResolvedValue(
			[
				"formulas:",
				"  bvViewListPosition: invalid",
				"  bvViewListSidePanePosition: unknown",
				"  bvViewListTopOverflowMode: broken",
				"views:",
				"  - type: table",
				"    name: Table",
			].join("\n")
		);

		const prefs = await store.getViewListFormulaPrefs(file);
		expect(prefs.position).toBeNull();
		expect(prefs.sidePanePosition).toBeNull();
		expect(prefs.topOverflowMode).toBeNull();
	});

	it("removes formulas object when last field is cleared", async () => {
		cachedRead.mockResolvedValue(
			[
				"formulas:",
				"  bvViewListShowProperty: \"true\"",
				"views:",
				"  - type: table",
				"    name: Table",
			].join("\n")
		);

		const updated = await store.setViewListShowProperty(file, null);
		expect(updated).toBe(true);
		const parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.formulas).toBeUndefined();
	});

	it("stores top overflow mode and deletes it on null", async () => {
		cachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n"
		);
		let updated = await store.setViewListTopOverflowMode(file, "wrap");
		expect(updated).toBe(true);
		let parsed = parseYaml(modify.mock.calls[0][1] as string) as any;
		expect(parsed.formulas.bvViewListTopOverflowMode).toBe("wrap");

		cachedRead.mockResolvedValue(modify.mock.calls[0][1] as string);
		updated = await store.setViewListTopOverflowMode(file, null);
		expect(updated).toBe(true);
		parsed = parseYaml(modify.mock.calls[1][1] as string) as any;
		expect(parsed.formulas).toBeUndefined();
	});
});
