const DATE_LIKE_PROPERTY_NAMES = ["date", "due", "scheduled", "deadline", "start", "end"];

export function isDateLikePropertyId(propertyId: string): boolean {
	const [scope, rawName] = propertyId.split(".", 2);
	const propertyName = rawName ?? propertyId;

	if (scope === "file" || propertyName.trim().length === 0) return false;

	const tokens = propertyName
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 0);

	return DATE_LIKE_PROPERTY_NAMES.some((name) => tokens.includes(name));
}

export function formatDateLikeValue(value: unknown): string | null {
	const raw = valueToPrimitiveString(value);
	if (!raw) return null;

	const valueText = raw.trim();
	if (!valueText || valueText === "null" || valueText === "undefined") return null;

	const isoDate = valueText.match(
		/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
	);
	if (isoDate) {
		const [, year, month, day, hour, minute] = isoDate;
		const date = `${day}-${month}-${year}`;
		return hour && minute ? `${date} ${hour}:${minute}` : date;
	}

	return valueText;
}

export function getStaticDateDisplayValue(propertyId: string, value: unknown): string | null {
	if (!isDateLikePropertyId(propertyId)) return null;
	return formatDateLikeValue(value);
}

function valueToPrimitiveString(value: unknown): string | null {
	if (value == null) return null;
	if (typeof value === "string") return value;
	if (value instanceof Date) return value.toISOString();

	try {
		const maybeStringable = value as { toString?: () => string };
		if (typeof maybeStringable.toString === "function") {
			return maybeStringable.toString();
		}
	} catch {
		return null;
	}

	return String(value);
}
