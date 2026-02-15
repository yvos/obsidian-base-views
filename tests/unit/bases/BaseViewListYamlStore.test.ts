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
});
