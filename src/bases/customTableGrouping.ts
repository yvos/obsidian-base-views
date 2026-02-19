// グループキー抽出時の挙動（unnestやNoneラベル）を指定する。
export interface GroupExtractionOptions {
	unnest: boolean;
	noneLabel?: string;
}

// グループキーごとにエントリ配列を保持する構造を表す。
export interface GroupedEntries<TEntry> {
	key: string;
	entries: TEntry[];
}

// グループキーの昇順・降順を指定する方向型を表す。
export type GroupSortDirection = "ASC" | "DESC";

const GROUP_NONE_ALIASES = new Set(["", "none", "unknown", "null", "undefined"]);
const GROUP_KEY_COLLATOR = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

// キー文字列がNone扱いの別名値かどうかを判定する。
function isNoneLikeGroupKey(value: string): boolean {
	return GROUP_NONE_ALIASES.has(value.trim().toLowerCase());
}

// グループキーをNone末尾ルール付きで比較し、並び順を返す。
export function compareGroupKeys(
	left: string,
	right: string,
	direction: GroupSortDirection = "ASC"
): number {
	const leftNone = isNoneLikeGroupKey(left);
	const rightNone = isNoneLikeGroupKey(right);
	if (leftNone && !rightNone) return 1;
	if (!leftNone && rightNone) return -1;

	const base = GROUP_KEY_COLLATOR.compare(left, right);
	return direction === "DESC" ? -base : base;
}

// グループ配列をキー比較ロジックで並べ替えた新配列を返す。
export function sortGroupedEntries<TEntry extends { key: string }>(
	groups: TEntry[],
	direction: GroupSortDirection = "ASC"
): TEntry[] {
	return [...groups].sort((left, right) =>
		compareGroupKeys(left.key, right.key, direction)
	);
}

// 各エントリの値をグループキーへ変換してグループ化する。
export function groupEntriesByValue<TEntry>(
	entries: TEntry[],
	getValue: (entry: TEntry) => unknown,
	options: GroupExtractionOptions
): GroupedEntries<TEntry>[] {
	const grouped = new Map<string, TEntry[]>();

	for (const entry of entries) {
		const keys = extractGroupKeys(getValue(entry), options);
		const uniqueKeys = new Set(keys);
		for (const key of uniqueKeys) {
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)?.push(entry);
		}
	}

	return Array.from(grouped.entries()).map(([key, bucket]) => ({
		key,
		entries: bucket,
	}));
}

// グループ対象値に配列系のマルチ値が含まれるかを判定する。
export function hasAnyMultiValueEntries<TEntry>(
	entries: TEntry[],
	getValue: (entry: TEntry) => unknown
): boolean {
	for (const entry of entries) {
		if (extractListValues(getValue(entry)) !== null) {
			return true;
		}
	}
	return false;
}

// 1つの値から設定に応じたグループキー配列を抽出する。
export function extractGroupKeys(
	value: unknown,
	options: GroupExtractionOptions
): string[] {
	const noneLabel = options.noneLabel ?? "None";
	const listValues = extractListValues(value);

	if (listValues !== null) {
		if (listValues.length === 0) return [noneLabel];

		if (!options.unnest) {
			const combined = listValues
				.map((item) => toGroupKeyString(item, noneLabel))
				.filter((item) => item.length > 0)
				.join(", ");
			return [combined.length > 0 ? combined : noneLabel];
		}

		const keys = new Set<string>();
		for (const item of listValues) {
			keys.add(toGroupKeyString(item, noneLabel));
		}
		return keys.size > 0 ? Array.from(keys) : [noneLabel];
	}

	return [toGroupKeyString(value, noneLabel)];
}

// 値を配列として扱える場合に配列要素を抽出して返す。
export function extractListValues(value: unknown): unknown[] | null {
	if (value == null) return null;
	if (Array.isArray(value)) return value;

	if (typeof value !== "object") return null;

	const asRecord = value as Record<string, unknown>;

	if (Array.isArray(asRecord.value)) {
		return asRecord.value;
	}
	if (Array.isArray(asRecord.data)) {
		return asRecord.data;
	}

	const lenFn = asRecord.length;
	const atFn = asRecord.at;
	if (typeof lenFn === "function" && typeof atFn === "function") {
		try {
			const rawLen = lenFn.call(value);
			const len = typeof rawLen === "number" ? rawLen : Number(rawLen);
			if (!Number.isFinite(len) || len < 0) return null;
			const result: unknown[] = [];
			for (let index = 0; index < len; index++) {
				result.push(atFn.call(value, index));
			}
			return result;
		} catch {
			return null;
		}
	}

	return null;
}

// 任意値をグループキー表示用の文字列へ正規化して返す。
export function toGroupKeyString(value: unknown, noneLabel = "None"): string {
	if (value == null) return noneLabel;

	if (typeof value === "object") {
		const objectValue = value as Record<string, unknown>;
		const constructorName = (objectValue.constructor as { name?: string } | undefined)?.name;

		if (constructorName === "NullValue") return noneLabel;

		if (typeof objectValue.isTruthy === "function") {
			try {
				if (!(objectValue.isTruthy as () => boolean)()) return noneLabel;
			} catch {
				// ignore and continue
			}
		}

		if (objectValue.file && typeof objectValue.file === "object") {
			const filePath = (objectValue.file as { path?: unknown }).path;
			if (typeof filePath === "string" && filePath.length > 0) return filePath;
		}

		if (objectValue.date instanceof Date) {
			const year = objectValue.date.getFullYear();
			const month = String(objectValue.date.getMonth() + 1).padStart(2, "0");
			const day = String(objectValue.date.getDate()).padStart(2, "0");
			return `${year}-${month}-${day}`;
		}

		if (Object.prototype.hasOwnProperty.call(objectValue, "data")) {
			const rawData = objectValue.data;
			if (rawData == null) return noneLabel;
			if (rawData !== value) {
				return toGroupKeyString(rawData, noneLabel);
			}
		}
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : noneLabel;
	}
	if (typeof value === "number") {
		return Number.isFinite(value) ? String(value) : noneLabel;
	}
	if (typeof value === "boolean") {
		return value ? "True" : "False";
	}

	if (Array.isArray(value)) {
		if (value.length === 0) return noneLabel;
		const combined = value.map((item) => toGroupKeyString(item, noneLabel)).join(", ");
		return combined.length > 0 ? combined : noneLabel;
	}

	if (typeof value === "object" && value !== null && typeof (value as { toString?: unknown }).toString === "function") {
		try {
			const asString = (value as { toString: () => string }).toString().trim();
			if (
				asString.length > 0 &&
				asString !== "[object Object]" &&
				asString !== "null" &&
				asString !== "undefined"
			) {
				return asString;
			}
		} catch {
			// fallback to String(value)
		}
	}

	const fallback = String(value).trim();
	if (fallback.length === 0 || fallback === "null" || fallback === "undefined") {
		return noneLabel;
	}
	return fallback;
}
