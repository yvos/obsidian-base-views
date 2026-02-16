export interface IconicFileIconDescriptor {
	icon: string;
	color?: string;
}

interface IconicFileIconSource {
	icon?: unknown;
	color?: unknown;
}

interface IconicPluginLike {
	getFileItem?: (path: string, includeDefault?: boolean) => unknown;
	settings?: {
		fileIcons?: Record<string, IconicFileIconSource>;
	};
}

const LUCIDE_PREFIX = "lucide-";

function toNonEmptyString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function toIconDescriptor(value: unknown): IconicFileIconDescriptor | null {
	if (!value || typeof value !== "object") return null;
	const source = value as IconicFileIconSource;
	const icon = toNonEmptyString(source.icon);
	if (!icon) return null;

	const color = toNonEmptyString(source.color) ?? undefined;
	return { icon, color };
}

export function resolveIconicFileIcon(
	iconicPlugin: unknown,
	filePath: string
): IconicFileIconDescriptor | null {
	if (!filePath || filePath.trim().length === 0) return null;
	if (!iconicPlugin || typeof iconicPlugin !== "object") return null;

	const plugin = iconicPlugin as IconicPluginLike;
	if (typeof plugin.getFileItem === "function") {
		try {
			const byMethod = toIconDescriptor(plugin.getFileItem(filePath, false));
			if (byMethod) return byMethod;
		} catch {
			// Ignore Iconic internal API failures and fall back to settings data.
		}
	}

	const fileIcons = plugin.settings?.fileIcons;
	if (!fileIcons || typeof fileIcons !== "object") return null;

	return toIconDescriptor(fileIcons[filePath]);
}

export function normalizeIconicLucideIconName(icon: string): string | null {
	const trimmed = toNonEmptyString(icon);
	if (!trimmed) return null;

	if (trimmed.startsWith(LUCIDE_PREFIX)) {
		const name = trimmed.slice(LUCIDE_PREFIX.length);
		return name.length > 0 ? name : null;
	}

	if (/^[a-z0-9-]+$/i.test(trimmed)) {
		return trimmed;
	}

	return null;
}

export function formatGroupTitleWithProperty(
	groupValueTitle: string,
	propertyDisplayName: string | null,
	showPropertyName: boolean
): string {
	if (!showPropertyName) return groupValueTitle;

	const propertyLabel = propertyDisplayName?.trim();
	if (!propertyLabel) return groupValueTitle;

	const normalizedGroupTitle = groupValueTitle.trim().toLowerCase();
	const normalizedPrefix = `${propertyLabel.toLowerCase()}:`;
	if (normalizedGroupTitle.startsWith(normalizedPrefix)) {
		return groupValueTitle;
	}

	return `${propertyLabel}: ${groupValueTitle}`;
}
