import { App, TFile } from "obsidian";

export const TASKNOTES_PLUGIN_ID = "tasknotes";

// External TaskNotes runtime surface used by Base Views.
export interface TaskNotesRuntimeLike {
	settings?: Record<string, unknown>;
	i18n?: { translate?: (key: string, params?: Record<string, string | number>) => string };
	fieldMapper?: unknown;
	emitter?: {
		on?: (name: string, callback: (...args: unknown[]) => void) => unknown;
		offref?: (ref: unknown) => void;
		trigger?: (name: string, ...args: unknown[]) => void;
	};
	cacheManager?: unknown;
	dependencyCache?: unknown;
	statusManager?: unknown;
	priorityManager?: unknown;
	taskService?: unknown;
	projectSubtasksService?: unknown;
	expandedProjectsService?: unknown;
	taskSelectionService?: unknown;
	toggleRecurringTaskComplete?: (...args: unknown[]) => Promise<unknown>;
	toggleTaskStatus?: (...args: unknown[]) => Promise<unknown>;
	updateTaskProperty?: (...args: unknown[]) => Promise<unknown>;
	openTaskEditModal?: (...args: unknown[]) => Promise<unknown>;
	applyProjectSubtaskFilter?: (...args: unknown[]) => Promise<unknown>;
	getActiveTimeSession?: (...args: unknown[]) => unknown;
	openTagsPane?: (...args: unknown[]) => Promise<unknown>;
	formatTime?: (...args: unknown[]) => string;
}

function getPluginsRegistry(app: App): Record<string, unknown> | null {
	const appWithPlugins = app as App & {
		plugins?: { plugins?: Record<string, unknown> };
	};
	return appWithPlugins.plugins?.plugins ?? null;
}

// Resolve external TaskNotes plugin runtime if available.
export function getTaskNotesRuntime(app: App): TaskNotesRuntimeLike | null {
	const plugins = getPluginsRegistry(app);
	if (!plugins) return null;
	const runtime = plugins[TASKNOTES_PLUGIN_ID];
	if (!runtime || typeof runtime !== "object") return null;
	return runtime as TaskNotesRuntimeLike;
}

export function hasTaskNotesRuntime(app: App): boolean {
	return getTaskNotesRuntime(app) != null;
}

// Open a markdown file path using Obsidian workspace.
export async function openTaskNotesFile(
	app: App,
	path: string,
	newTab = false
): Promise<boolean> {
	if (!path) return false;
	const abstract = app.vault.getAbstractFileByPath(path);
	if (abstract instanceof TFile) {
		if (newTab) {
			await app.workspace.openLinkText(path, "", true);
		} else {
			await app.workspace.getLeaf(false).openFile(abstract);
		}
		return true;
	}
	return false;
}
