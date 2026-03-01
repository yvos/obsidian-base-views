import type { BaseViewsSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "./defaults";

type LegacyBaseViewsSettings = Partial<BaseViewsSettings> & {
	basesViewListShowNativeToolbar?: boolean;
};

const SUPPORTED_UI_LANGUAGES = new Set(["en", "ja"]);

export function normalizeBaseViewsUILanguage(language: unknown): string {
	if (typeof language === "string" && SUPPORTED_UI_LANGUAGES.has(language)) {
		return language;
	}
	return "en";
}

export function hasAnyBaseViewsFeatureEnabled(
	settings: Pick<
		BaseViewsSettings,
		"enableBasesViewListSidebar" | "enableBasesCustomTableView" | "enableBasesTaskListCustomView"
	>
): boolean {
	return (
		settings.enableBasesViewListSidebar ||
		settings.enableBasesCustomTableView ||
		settings.enableBasesTaskListCustomView
	);
}

export function migrateBaseViewsSettings(
	loadedData: Partial<BaseViewsSettings> | null
): BaseViewsSettings {
	const loaded = (loadedData ?? {}) as LegacyBaseViewsSettings;
	const settings = Object.assign({}, DEFAULT_SETTINGS, loaded) as BaseViewsSettings;

	// Legacy migration: when only the old global switch exists, fan out to the 3 feature toggles.
	const legacyEnableBases =
		typeof loaded.enableBases === "boolean" ? loaded.enableBases : null;
	if (legacyEnableBases !== null) {
		if (typeof loaded.enableBasesViewListSidebar !== "boolean") {
			settings.enableBasesViewListSidebar = legacyEnableBases;
		}
		if (typeof loaded.enableBasesCustomTableView !== "boolean") {
			settings.enableBasesCustomTableView = legacyEnableBases;
		}
		if (typeof loaded.enableBasesTaskListCustomView !== "boolean") {
			settings.enableBasesTaskListCustomView = legacyEnableBases;
		}
	}

	// Migration: old "show native toolbar" flag -> new "hide native toolbar" flag.
	if (
		typeof loaded.basesViewListHideNativeToolbar !== "boolean" &&
		typeof loaded.basesViewListShowNativeToolbar === "boolean"
	) {
		settings.basesViewListHideNativeToolbar = !loaded.basesViewListShowNativeToolbar;
	}

	settings.uiLanguage = normalizeBaseViewsUILanguage(settings.uiLanguage);
	settings.enableBases = hasAnyBaseViewsFeatureEnabled(settings);
	return settings;
}
