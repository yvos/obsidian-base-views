// view色設定で利用するプリセットID定義。
export const VIEW_COLOR_PRESET_IDS = [
	"black",
	"red",
	"orange",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
] as const;

export type ViewColorPresetId = (typeof VIEW_COLOR_PRESET_IDS)[number];
export type ThemeMode = "light" | "dark";

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface ResolveViewColorOptions {
	doc?: Document;
	scopeEl?: Element | null;
}

const VIEW_COLOR_PRESET_FALLBACK_HEX: Record<ViewColorPresetId, string> = {
	black: "#000000",
	red: "#ef4444",
	orange: "#f97316",
	yellow: "#eab308",
	green: "#22c55e",
	cyan: "#06b6d4",
	blue: "#3b82f6",
	purple: "#8b5cf6",
	pink: "#ec4899",
};

const RGB_INPUT_PATTERN =
	/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i;

// 設定値を `.base views[].bg-color` の保存形式へ正規化する。
export function normalizeViewBgColorValue(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;

	const lower = trimmed.toLowerCase();
	if (isViewColorPresetId(lower)) {
		return lower;
	}

	const match = lower.match(RGB_INPUT_PATTERN);
	if (!match) return null;

	const r = Number.parseInt(match[1], 10);
	const g = Number.parseInt(match[2], 10);
	const b = Number.parseInt(match[3], 10);
	if (!isValidRgbByte(r) || !isValidRgbByte(g) || !isValidRgbByte(b)) {
		return null;
	}
	return toCssRgb({ r, g, b });
}

// 設定配列から有効なRGB履歴のみを抽出して先頭優先で正規化する。
export function normalizeRgbColorHistory(value: unknown, limit = 5): string[] {
	if (!Array.isArray(value) || limit <= 0) return [];
	const result: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		const normalized = normalizeViewBgColorValue(item);
		if (!isRgbViewColorValue(normalized)) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
		if (result.length >= limit) break;
	}
	return result;
}

// `bg-color` 値をRGBへ解決する。無効値は null を返す。
export function resolveViewColorToRgb(
	value: unknown,
	options: ResolveViewColorOptions = {}
): RgbColor | null {
	const normalized = normalizeViewBgColorValue(value);
	if (!normalized) return null;

	if (isRgbViewColorValue(normalized)) {
		return parseRgbFunctionColor(normalized);
	}

	return resolvePresetColorToRgb(normalized, options);
}

// 現在のテーマモードを推定する。
export function resolveThemeMode(doc?: Document): ThemeMode {
	const body = doc?.body;
	if (body?.classList.contains("theme-dark")) return "dark";
	if (body?.classList.contains("theme-light")) return "light";
	return "light";
}

// view一覧の非active name領域向け淡色化。
export function tintViewListNameColor(base: RgbColor, mode: ThemeMode): RgbColor {
	return mode === "dark" ? mixRgb(base, { r: 0, g: 0, b: 0 }, 0.52) : mixRgb(base, { r: 255, g: 255, b: 255 }, 0.72);
}

// view一覧のactive行（名前領域以外）向け淡色化。
export function tintViewListActiveBackgroundColor(base: RgbColor, mode: ThemeMode): RgbColor {
	return mode === "dark" ? mixRgb(base, { r: 0, g: 0, b: 0 }, 0.66) : mixRgb(base, { r: 255, g: 255, b: 255 }, 0.86);
}

// Custom view向け（さらに彩度低下 + 淡色化）。
export function tintCustomViewBackgroundColor(base: RgbColor, mode: ThemeMode): RgbColor {
	const desaturated = desaturateRgb(base, 0.5);
	return mode === "dark"
		? mixRgb(desaturated, { r: 0, g: 0, b: 0 }, 0.74)
		: mixRgb(desaturated, { r: 255, g: 255, b: 255 }, 0.9);
}

// 背景色に対して可読性の高い文字色（黒寄り/白）を返す。
export function pickReadableTextColor(background: RgbColor): RgbColor {
	const luminance = relativeLuminance(background);
	return luminance < 0.34 ? { r: 255, g: 255, b: 255 } : { r: 24, g: 24, b: 24 };
}

// RGBオブジェクトを `rgb(r,g,b)` 文字列へ整形する。
export function toCssRgb(value: RgbColor): string {
	const r = clampByte(Math.round(value.r));
	const g = clampByte(Math.round(value.g));
	const b = clampByte(Math.round(value.b));
	return `rgb(${r},${g},${b})`;
}

// presets判定ヘルパー。
export function isViewColorPresetId(value: string): value is ViewColorPresetId {
	return (VIEW_COLOR_PRESET_IDS as readonly string[]).includes(value);
}

// `rgb(...)` 形式かどうかを判定する。
export function isRgbViewColorValue(value: string | null): value is string {
	return typeof value === "string" && value.startsWith("rgb(");
}

function resolvePresetColorToRgb(
	presetId: ViewColorPresetId,
	options: ResolveViewColorOptions
): RgbColor | null {
	const fallback = parseHexColor(VIEW_COLOR_PRESET_FALLBACK_HEX[presetId]);
	if (!fallback) return null;

	const doc = options.doc;
	const win = doc?.defaultView;
	if (!doc || !win) {
		return fallback;
	}

	const scopeEl = options.scopeEl ?? doc.body ?? doc.documentElement;
	if (!(scopeEl instanceof Element)) {
		return fallback;
	}

	const cssVarName = `--bv-view-color-${presetId}`;
	const raw = win.getComputedStyle(scopeEl).getPropertyValue(cssVarName).trim();
	if (!raw) return fallback;

	return parseCssColorToRgb(raw, doc) ?? fallback;
}

function parseCssColorToRgb(value: string, doc: Document): RgbColor | null {
	const hex = parseHexColor(value);
	if (hex) return hex;
	const rgbLike = parseRgbFunctionColor(value);
	if (rgbLike) return rgbLike;

	const win = doc.defaultView;
	const body = doc.body;
	if (!win || !body) return null;

	const parserEl = doc.createElement("span");
	parserEl.style.color = "";
	parserEl.style.color = value;
	if (!parserEl.style.color) return null;

	body.appendChild(parserEl);
	const computed = win.getComputedStyle(parserEl).color;
	parserEl.remove();

	return parseHexColor(computed) ?? parseRgbFunctionColor(computed);
}

function parseRgbFunctionColor(value: string): RgbColor | null {
	const match = value
		.trim()
		.match(
			/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*[0-9.]+\s*)?\)$/i
		);
	if (!match) return null;

	const r = Number.parseFloat(match[1]);
	const g = Number.parseFloat(match[2]);
	const b = Number.parseFloat(match[3]);
	if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
		return null;
	}

	return {
		r: clampByte(Math.round(r)),
		g: clampByte(Math.round(g)),
		b: clampByte(Math.round(b)),
	};
}

function parseHexColor(value: string): RgbColor | null {
	const text = value.trim();
	const short = text.match(/^#([0-9a-f]{3})$/i);
	if (short) {
		const [r, g, b] = short[1].split("");
		return {
			r: Number.parseInt(`${r}${r}`, 16),
			g: Number.parseInt(`${g}${g}`, 16),
			b: Number.parseInt(`${b}${b}`, 16),
		};
	}

	const full = text.match(/^#([0-9a-f]{6})$/i);
	if (!full) return null;
	return {
		r: Number.parseInt(full[1].slice(0, 2), 16),
		g: Number.parseInt(full[1].slice(2, 4), 16),
		b: Number.parseInt(full[1].slice(4, 6), 16),
	};
}

function isValidRgbByte(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 255;
}

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, value));
}

function mixRgb(base: RgbColor, target: RgbColor, ratio: number): RgbColor {
	const safeRatio = Math.max(0, Math.min(1, ratio));
	return {
		r: Math.round(base.r * (1 - safeRatio) + target.r * safeRatio),
		g: Math.round(base.g * (1 - safeRatio) + target.g * safeRatio),
		b: Math.round(base.b * (1 - safeRatio) + target.b * safeRatio),
	};
}

function desaturateRgb(color: RgbColor, factor: number): RgbColor {
	const safeFactor = Math.max(0, Math.min(1, factor));
	const { h, s, l } = rgbToHsl(color);
	return hslToRgb({ h, s: s * (1 - safeFactor), l });
}

function rgbToHsl(color: RgbColor): { h: number; s: number; l: number } {
	const r = clampByte(color.r) / 255;
	const g = clampByte(color.g) / 255;
	const b = clampByte(color.b) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;

	let h = 0;
	const l = (max + min) / 2;
	let s = 0;

	if (delta > 0) {
		s = delta / (1 - Math.abs(2 * l - 1));
		switch (max) {
			case r:
				h = 60 * (((g - b) / delta) % 6);
				break;
			case g:
				h = 60 * ((b - r) / delta + 2);
				break;
			default:
				h = 60 * ((r - g) / delta + 4);
				break;
		}
	}

	if (h < 0) h += 360;
	return { h, s, l };
}

function hslToRgb(value: { h: number; s: number; l: number }): RgbColor {
	const h = ((value.h % 360) + 360) % 360;
	const s = Math.max(0, Math.min(1, value.s));
	const l = Math.max(0, Math.min(1, value.l));
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;

	let rPrime = 0;
	let gPrime = 0;
	let bPrime = 0;

	if (h < 60) {
		rPrime = c;
		gPrime = x;
	} else if (h < 120) {
		rPrime = x;
		gPrime = c;
	} else if (h < 180) {
		gPrime = c;
		bPrime = x;
	} else if (h < 240) {
		gPrime = x;
		bPrime = c;
	} else if (h < 300) {
		rPrime = x;
		bPrime = c;
	} else {
		rPrime = c;
		bPrime = x;
	}

	return {
		r: Math.round((rPrime + m) * 255),
		g: Math.round((gPrime + m) * 255),
		b: Math.round((bPrime + m) * 255),
	};
}

function relativeLuminance(color: RgbColor): number {
	const normalize = (channel: number): number => {
		const c = clampByte(channel) / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	};
	const r = normalize(color.r);
	const g = normalize(color.g);
	const b = normalize(color.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
