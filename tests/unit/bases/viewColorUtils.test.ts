import {
	normalizeRgbColorHistory,
	normalizeViewBgColorValue,
	pickReadableTextColor,
	resolveThemeMode,
	resolveViewColorToRgb,
	tintCustomViewBackgroundColor,
	toCssRgb,
} from "../../../src/bases/viewColorUtils";

describe("viewColorUtils", () => {
	it("normalizes preset and rgb values", () => {
		expect(normalizeViewBgColorValue(" black ")).toBe("black");
		expect(normalizeViewBgColorValue(" Red ")).toBe("red");
		expect(normalizeViewBgColorValue("RGB( 1, 2 ,3)")).toBe("rgb(1,2,3)");
		expect(normalizeViewBgColorValue("rgb(256,0,0)")).toBeNull();
		expect(normalizeViewBgColorValue("invalid")).toBeNull();
	});

	it("normalizes rgb history with dedupe and max limit", () => {
		const normalized = normalizeRgbColorHistory(
			[
				"rgb(1,2,3)",
				"red",
				"RGB(1,2,3)",
				"rgb(4,5,6)",
				"rgb(7,8,9)",
				"rgb(10,11,12)",
				"rgb(13,14,15)",
				"rgb(16,17,18)",
			],
			5
		);
		expect(normalized).toEqual([
			"rgb(1,2,3)",
			"rgb(4,5,6)",
			"rgb(7,8,9)",
			"rgb(10,11,12)",
			"rgb(13,14,15)",
		]);
	});

	it("resolves preset color via css variable when available", () => {
		document.body.style.setProperty("--bv-view-color-red", "rgb(11,22,33)");
		const resolved = resolveViewColorToRgb("red", { doc: document, scopeEl: document.body });
		expect(resolved).toEqual({ r: 11, g: 22, b: 33 });
		document.body.style.removeProperty("--bv-view-color-red");
	});

	it("provides fallback behavior for custom view tint and readable text", () => {
		document.body.classList.add("theme-dark");
		expect(resolveThemeMode(document)).toBe("dark");
		document.body.classList.remove("theme-dark");
		document.body.classList.add("theme-light");
		expect(resolveThemeMode(document)).toBe("light");
		document.body.classList.remove("theme-light");

		const tinted = tintCustomViewBackgroundColor({ r: 120, g: 160, b: 220 }, "light");
		expect(toCssRgb(tinted)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);

		const lightText = pickReadableTextColor({ r: 20, g: 20, b: 20 });
		const darkText = pickReadableTextColor({ r: 245, g: 245, b: 245 });
		expect(lightText).toEqual({ r: 255, g: 255, b: 255 });
		expect(darkText).toEqual({ r: 24, g: 24, b: 24 });
	});
});
