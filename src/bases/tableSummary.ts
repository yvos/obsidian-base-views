export type TableSummaryKey =
	| "empty"
	| "filled"
	| "unique"
	| "sum"
	| "avg"
	| "min"
	| "max"
	| "earliest"
	| "latest"
	| "range"
	| "checked"
	| "unchecked";

export interface TableSummaryOption {
	key: TableSummaryKey;
	label: string;
}

const COMMON_SUMMARIES: TableSummaryOption[] = [
	{ key: "empty", label: "Empty" },
	{ key: "filled", label: "Filled" },
	{ key: "unique", label: "Unique" },
];

const NUMBER_SUMMARIES: TableSummaryOption[] = [
	{ key: "sum", label: "Sum" },
	{ key: "avg", label: "Average" },
	{ key: "min", label: "Min" },
	{ key: "max", label: "Max" },
];

const DATE_SUMMARIES: TableSummaryOption[] = [
	{ key: "earliest", label: "Earliest" },
	{ key: "latest", label: "Latest" },
	{ key: "range", label: "Range" },
];

const BOOLEAN_SUMMARIES: TableSummaryOption[] = [
	{ key: "checked", label: "Checked" },
	{ key: "unchecked", label: "Unchecked" },
];

interface NormalizedValue {
	raw: unknown;
	empty: boolean;
	scalar: string | number | boolean | Date | null;
}

function normalizeBasesValue(value: unknown): unknown {
	if (value === null || value === undefined) return null;

	const asAny = value as any;
	if (typeof asAny.isEmpty === "function" && asAny.isEmpty()) return null;
	if (asAny.constructor?.name === "NullValue") return null;

	// PrimitiveValue
	if (Object.prototype.hasOwnProperty.call(asAny, "data")) {
		return normalizeBasesValue(asAny.data);
	}

	// ListValue
	if (typeof asAny.length === "function" && typeof asAny.get === "function") {
		const len = asAny.length();
		const list: unknown[] = [];
		for (let i = 0; i < len; i++) {
			list.push(normalizeBasesValue(asAny.get(i)));
		}
		return list;
	}

	// FileValue
	if (asAny.file?.path) {
		return String(asAny.file.path);
	}

	// DateValue
	if (asAny.date instanceof Date) {
		return new Date(asAny.date.getTime());
	}

	return value;
}

function toNormalizedValue(value: unknown): NormalizedValue {
	const normalized = normalizeBasesValue(value);

	if (normalized === null || normalized === undefined) {
		return { raw: value, empty: true, scalar: null };
	}

	if (Array.isArray(normalized)) {
		if (normalized.length === 0) {
			return { raw: value, empty: true, scalar: null };
		}
		return { raw: value, empty: false, scalar: normalized.map((item) => stringifyValue(item)).join(", ") };
	}

	if (normalized instanceof Date) {
		return { raw: value, empty: false, scalar: normalized };
	}

	if (typeof normalized === "string") {
		const trimmed = normalized.trim();
		if (!trimmed) return { raw: value, empty: true, scalar: null };

		const date = tryParseDate(trimmed);
		if (date) return { raw: value, empty: false, scalar: date };

		const bool = tryParseBoolean(trimmed);
		if (bool !== null) return { raw: value, empty: false, scalar: bool };

		const numeric = tryParseNumber(trimmed);
		if (numeric !== null) return { raw: value, empty: false, scalar: numeric };

		return { raw: value, empty: false, scalar: trimmed };
	}

	if (typeof normalized === "number") {
		return Number.isFinite(normalized)
			? { raw: value, empty: false, scalar: normalized }
			: { raw: value, empty: true, scalar: null };
	}

	if (typeof normalized === "boolean") {
		return { raw: value, empty: false, scalar: normalized };
	}

	if (normalized instanceof Date) {
		return { raw: value, empty: false, scalar: normalized };
	}

	const asText = stringifyValue(normalized);
	if (!asText.trim()) {
		return { raw: value, empty: true, scalar: null };
	}
	return { raw: value, empty: false, scalar: asText };
}

function stringifyValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return formatDate(value);
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map((item) => stringifyValue(item)).join(", ");
	if (typeof (value as any).toString === "function") return (value as any).toString();
	return String(value);
}

function tryParseNumber(value: string): number | null {
	if (!value) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function tryParseDate(value: string): Date | null {
	const timestamp = Date.parse(value);
	if (Number.isNaN(timestamp)) return null;
	return new Date(timestamp);
}

function tryParseBoolean(value: string): boolean | null {
	const lower = value.toLowerCase();
	if (lower === "true" || lower === "yes" || lower === "checked" || lower === "on") return true;
	if (lower === "false" || lower === "no" || lower === "unchecked" || lower === "off") return false;
	return null;
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) return "";
	const rounded = Math.round(value * 100) / 100;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatDuration(milliseconds: number): string {
	if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0d";
	const totalHours = Math.floor(milliseconds / (1000 * 60 * 60));
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	if (days > 0 && hours > 0) return `${days}d ${hours}h`;
	if (days > 0) return `${days}d`;
	return `${hours}h`;
}

export function getSummaryOptions(values: unknown[]): TableSummaryOption[] {
	const normalized = values.map((value) => toNormalizedValue(value)).filter((value) => !value.empty);

	let hasNumber = false;
	let hasDate = false;
	let hasBoolean = false;

	for (const value of normalized) {
		if (typeof value.scalar === "number") hasNumber = true;
		if (value.scalar instanceof Date) hasDate = true;
		if (typeof value.scalar === "boolean") hasBoolean = true;
	}

	const options = [...COMMON_SUMMARIES];
	if (hasNumber) options.push(...NUMBER_SUMMARIES);
	if (hasDate) options.push(...DATE_SUMMARIES);
	if (hasBoolean) options.push(...BOOLEAN_SUMMARIES);

	return options;
}

export function calculateSummary(values: unknown[], summaryKey: TableSummaryKey): string {
	const normalized = values.map((value) => toNormalizedValue(value));
	const filled = normalized.filter((value) => !value.empty);

	switch (summaryKey) {
		case "empty":
			return String(normalized.length - filled.length);
		case "filled":
			return String(filled.length);
		case "unique": {
			const unique = new Set(
				filled.map((value) => {
					if (value.scalar instanceof Date) return value.scalar.toISOString();
					return stringifyValue(value.scalar);
				})
			);
			return String(unique.size);
		}
		case "sum": {
			const numbers = filled
				.map((value) => (typeof value.scalar === "number" ? value.scalar : null))
				.filter((value): value is number => value !== null);
			if (numbers.length === 0) return "";
			return formatNumber(numbers.reduce((acc, current) => acc + current, 0));
		}
		case "avg": {
			const numbers = filled
				.map((value) => (typeof value.scalar === "number" ? value.scalar : null))
				.filter((value): value is number => value !== null);
			if (numbers.length === 0) return "";
			return formatNumber(numbers.reduce((acc, current) => acc + current, 0) / numbers.length);
		}
		case "min": {
			const numbers = filled
				.map((value) => (typeof value.scalar === "number" ? value.scalar : null))
				.filter((value): value is number => value !== null);
			if (numbers.length === 0) return "";
			return formatNumber(Math.min(...numbers));
		}
		case "max": {
			const numbers = filled
				.map((value) => (typeof value.scalar === "number" ? value.scalar : null))
				.filter((value): value is number => value !== null);
			if (numbers.length === 0) return "";
			return formatNumber(Math.max(...numbers));
		}
		case "earliest": {
			const dates = filled
				.map((value) => (value.scalar instanceof Date ? value.scalar : null))
				.filter((value): value is Date => value !== null);
			if (dates.length === 0) return "";
			return formatDate(new Date(Math.min(...dates.map((date) => date.getTime()))));
		}
		case "latest": {
			const dates = filled
				.map((value) => (value.scalar instanceof Date ? value.scalar : null))
				.filter((value): value is Date => value !== null);
			if (dates.length === 0) return "";
			return formatDate(new Date(Math.max(...dates.map((date) => date.getTime()))));
		}
		case "range": {
			const dates = filled
				.map((value) => (value.scalar instanceof Date ? value.scalar : null))
				.filter((value): value is Date => value !== null);
			if (dates.length < 2) return "";
			const min = Math.min(...dates.map((date) => date.getTime()));
			const max = Math.max(...dates.map((date) => date.getTime()));
			return formatDuration(max - min);
		}
		case "checked": {
			const booleans = filled
				.map((value) => (typeof value.scalar === "boolean" ? value.scalar : null))
				.filter((value): value is boolean => value !== null);
			if (booleans.length === 0) return "";
			return String(booleans.filter(Boolean).length);
		}
		case "unchecked": {
			const booleans = filled
				.map((value) => (typeof value.scalar === "boolean" ? value.scalar : null))
				.filter((value): value is boolean => value !== null);
			if (booleans.length === 0) return "";
			return String(booleans.filter((value) => !value).length);
		}
		default:
			return "";
	}
}
