jest.mock("../../../src/i18n", () => ({
	createI18nService: jest.fn(() => ({
		translate: (key: string) => key,
		setLocale: jest.fn(),
	})),
}));

import BaseViewsPlugin from "../../../src/main";
import { migrateBaseViewsSettings } from "../../../src/settings/migrations";

function createTranslationService(initialLocale: "ja" | "en") {
	const state = { locale: initialLocale };
	const labels: Record<"ja" | "en", Record<string, string>> = {
		ja: {
			"commands.toggleBaseViewList": "View一覧をトグルする",
			"commands.openNextBaseView": "次のビューを開く",
			"commands.openPreviousBaseView": "前のビューを開く",
		},
		en: {
			"commands.toggleBaseViewList": "Toggle view list",
			"commands.openNextBaseView": "Open next view",
			"commands.openPreviousBaseView": "Open previous view",
		},
	};

	return {
		translate: (key: string) => labels[state.locale][key] ?? key,
		setLocale: (locale: string) => {
			state.locale = locale === "ja" ? "ja" : "en";
		},
	};
}

function createPlugin(locale: "ja" | "en") {
	const app: any = {
		workspace: {
			on: jest.fn(),
		},
		vault: {
			on: jest.fn(),
		},
		plugins: {
			plugins: {},
		},
	};
	const manifest: any = {
		id: "base-views",
		name: "Base Views",
		version: "0.1.0",
		minAppVersion: "1.0.0",
		description: "",
	};
	const plugin = new BaseViewsPlugin(app, manifest) as any;
	plugin.addCommand = jest.fn((command: any) => command);
	plugin.settings = migrateBaseViewsSettings(null);
	plugin.settings.uiLanguage = locale;
	plugin.i18n = createTranslationService(locale);
	return plugin;
}

describe("Base view command labels", () => {
	it("registers Japanese command labels when uiLanguage is ja", () => {
		const plugin = createPlugin("ja");

		plugin.registerBaseViewCommands();

		const names = (plugin.addCommand as jest.Mock).mock.calls.map((call) => call[0].name);
		expect(names).toEqual([
			"View一覧をトグルする",
			"次のビューを開く",
			"前のビューを開く",
		]);
	});

	it("registers English command labels when uiLanguage is en", () => {
		const plugin = createPlugin("en");

		plugin.registerBaseViewCommands();

		const names = (plugin.addCommand as jest.Mock).mock.calls.map((call) => call[0].name);
		expect(names).toEqual(["Toggle view list", "Open next view", "Open previous view"]);
	});

	it("updates command labels immediately after language change via saveSettings", async () => {
		const plugin = createPlugin("en");
		plugin.registerBaseViewCommands();
		plugin.saveData = jest.fn().mockResolvedValue(undefined);
		plugin.syncBasesFeatureBindings = jest.fn().mockResolvedValue(undefined);
		plugin.syncTaskRuntimeBindings = jest.fn();

		plugin.settings.uiLanguage = "ja";
		await plugin.saveSettings();

		expect(plugin.toggleActiveBaseViewListCommand?.name).toBe("View一覧をトグルする");
		expect(plugin.openNextBaseViewCommand?.name).toBe("次のビューを開く");
		expect(plugin.openPreviousBaseViewCommand?.name).toBe("前のビューを開く");
	});
});
