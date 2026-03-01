import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import {
	hasAnyBaseViewsFeatureEnabled,
	migrateBaseViewsSettings,
	normalizeBaseViewsUILanguage,
} from "../../../src/settings/migrations";

describe("baseViewsSettings migration", () => {
	it("returns defaults when loaded data is null", () => {
		const migrated = migrateBaseViewsSettings(null);
		expect(migrated).toEqual(DEFAULT_SETTINGS);
	});

	it("fans out legacy enableBases when feature toggles are missing", () => {
		const migrated = migrateBaseViewsSettings({
			enableBases: false,
		});
		expect(migrated.enableBasesViewListSidebar).toBe(false);
		expect(migrated.enableBasesCustomTableView).toBe(false);
		expect(migrated.enableBasesTaskListCustomView).toBe(false);
		expect(migrated.enableBases).toBe(false);
	});

	it("does not override explicit feature toggles even when legacy enableBases exists", () => {
		const migrated = migrateBaseViewsSettings({
			enableBases: false,
			enableBasesViewListSidebar: true,
		});
		expect(migrated.enableBasesViewListSidebar).toBe(true);
		expect(migrated.enableBasesCustomTableView).toBe(false);
		expect(migrated.enableBasesTaskListCustomView).toBe(false);
		expect(migrated.enableBases).toBe(true);
	});

	it("migrates legacy showNativeToolbar to hideNativeToolbar", () => {
		const migrated = migrateBaseViewsSettings({
			basesViewListShowNativeToolbar: true,
		} as any);
		expect(migrated.basesViewListHideNativeToolbar).toBe(false);
	});

	it("keeps hideNativeToolbar when both old and new keys are present", () => {
		const migrated = migrateBaseViewsSettings({
			basesViewListHideNativeToolbar: true,
			basesViewListShowNativeToolbar: true,
		} as any);
		expect(migrated.basesViewListHideNativeToolbar).toBe(true);
	});

	it("normalizes unsupported ui language to en", () => {
		expect(normalizeBaseViewsUILanguage("fr")).toBe("en");
		expect(normalizeBaseViewsUILanguage("ja")).toBe("ja");
		expect(normalizeBaseViewsUILanguage(undefined)).toBe("en");
	});

	it("computes aggregate feature enabled state", () => {
		expect(
			hasAnyBaseViewsFeatureEnabled({
				enableBasesViewListSidebar: false,
				enableBasesCustomTableView: false,
				enableBasesTaskListCustomView: false,
			})
		).toBe(false);

		expect(
			hasAnyBaseViewsFeatureEnabled({
				enableBasesViewListSidebar: false,
				enableBasesCustomTableView: true,
				enableBasesTaskListCustomView: false,
			})
		).toBe(true);
	});
});
