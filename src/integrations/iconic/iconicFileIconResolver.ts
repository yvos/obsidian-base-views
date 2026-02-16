import { App } from "obsidian";
import { IconicFileIconDescriptor, IconicFileIconSource, IconicPluginLike } from "./types";

const ICONIC_PLUGIN_ID = "iconic";
const ICONIC_RULE_PAGE_FILE = "file";

interface PluginManagerLike {
	getPlugin?: (id: string) => unknown;
	plugins?: Record<string, unknown>;
}

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

function getIconicPlugin(app: App): IconicPluginLike | null {
	const manager = (app as unknown as { plugins?: PluginManagerLike }).plugins;
	if (!manager) return null;

	if (typeof manager.getPlugin === "function") {
		const byGetter = manager.getPlugin(ICONIC_PLUGIN_ID);
		if (byGetter && typeof byGetter === "object") {
			return byGetter as IconicPluginLike;
		}
	}

	const byRecord = manager.plugins?.[ICONIC_PLUGIN_ID];
	if (byRecord && typeof byRecord === "object") {
		return byRecord as IconicPluginLike;
	}

	return null;
}

function safeCheckRuling(plugin: IconicPluginLike, filePath: string): unknown {
	try {
		return plugin.ruleManager?.checkRuling?.(ICONIC_RULE_PAGE_FILE, filePath) ?? null;
	} catch {
		return null;
	}
}

function safeGetFileItem(plugin: IconicPluginLike, filePath: string): unknown {
	if (typeof plugin.getFileItem !== "function") return null;

	const getFileItem = plugin.getFileItem;
	const shouldCallWithIncludeDefault = getFileItem.length >= 2;
	try {
		return shouldCallWithIncludeDefault ? getFileItem(filePath, false) : getFileItem(filePath);
	} catch {
		try {
			return shouldCallWithIncludeDefault ? getFileItem(filePath) : getFileItem(filePath, false);
		} catch {
			return null;
		}
	}
}

export function resolveIconicFileIcon(app: App, filePath: string): IconicFileIconDescriptor | null {
	if (!filePath || filePath.trim().length === 0) return null;

	const plugin = getIconicPlugin(app);
	if (!plugin) return null;

	const byRule = toIconDescriptor(safeCheckRuling(plugin, filePath));
	if (byRule) return byRule;

	const byFileItem = toIconDescriptor(safeGetFileItem(plugin, filePath));
	if (byFileItem) return byFileItem;

	const fileIcons = plugin.settings?.fileIcons;
	if (!fileIcons || typeof fileIcons !== "object") return null;

	return toIconDescriptor(fileIcons[filePath]);
}
