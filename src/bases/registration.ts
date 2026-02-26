/* eslint-disable no-console */
import { requireApiVersion } from "obsidian";
import TaskNotesPlugin from "../main";
import { buildTaskListViewCustomFactory } from "./TaskListViewCustom";
import { buildCustomTableViewFactory } from "./CustomTableView";
import { registerBasesView, unregisterBasesView } from "./api";

const SUB_GROUP_FILE_PROPERTIES = new Set([
	"file.folder",
	"file.ext",
	"file.size",
	"file.links",
	"file.backlinks",
	"file.embeds",
	"file.tags",
]);

function isSubGroupProperty(prop: string): boolean {
	return (
		prop.startsWith("note.") ||
		prop.startsWith("task.") ||
		prop.startsWith("formula.") ||
		SUB_GROUP_FILE_PROPERTIES.has(prop)
	);
}

// Register Base Views custom views only.
export async function registerBasesTaskList(plugin: TaskNotesPlugin): Promise<void> {
	// 必要なイベントやコマンドを一括登録し、初期化の前提を整える。
	const legacyEnabled = plugin.settings.enableBases !== false;
	const enableTaskListCustom =
		plugin.settings.enableBasesTaskListCustomView ?? legacyEnabled;
	const enableCustomTable = plugin.settings.enableBasesCustomTableView ?? legacyEnabled;
	if (!enableTaskListCustom && !enableCustomTable) return;
	if (!requireApiVersion("1.10.1")) return;

	const attemptRegistration = async (): Promise<boolean> => {
		try {
			let taskListCustomSuccess = false;
			if (enableTaskListCustom) {
				taskListCustomSuccess = registerBasesView(plugin, "tasknotesTaskListCustom", {
					name: "Task List View (Custom)",
					icon: "list-todo",
					factory: buildTaskListViewCustomFactory(plugin),
					options: () => [
						{
							type: "property",
							key: "subGroup",
							displayName: "Sub-group by",
							placeholder: "Select property for sub-grouping (optional)",
							filter: (prop: string) => isSubGroupProperty(prop),
						},
						{
							type: "toggle",
							key: "unnestMultiValueGroup",
							displayName: "Unnest multi-value groups",
							default: true,
						},
					],
				});
			}

			let customTableSuccess = false;
			if (enableCustomTable) {
				customTableSuccess = registerBasesView(plugin, "tasknotesCustomTable", {
					name: "Table View (Custom)",
					icon: "table-cells-merge",
					factory: buildCustomTableViewFactory(plugin),
					options: () => [
						{
							type: "property",
							key: "subGroup",
							displayName: "Sub-group by",
							placeholder: "Select property for sub-grouping (optional)",
							filter: (prop: string) => isSubGroupProperty(prop),
						},
						{
							type: "toggle",
							key: "unnestMultiValueGroup",
							displayName: "Unnest multi-value groups",
							default: true,
						},
						{
							type: "dropdown",
							key: "rowHeight",
							displayName: "Row height",
							default: "medium",
							options: {
								veryShort: "Very short",
								short: "Short",
								medium: "Medium",
								tall: "Tall",
								extraTall: "Extra tall",
							},
						},
					],
				});
			}

			if (!taskListCustomSuccess && !customTableSuccess) {
				console.debug("[BaseViews][Bases] Bases plugin not available for registration");
				return false;
			}

			plugin.app.workspace.iterateAllLeaves((leaf) => {
				if (leaf.view?.getViewType?.() === "bases") {
					const view = leaf.view as { refresh?: () => void };
					if (typeof view.refresh === "function") {
						try {
							view.refresh();
						} catch (refreshError) {
							console.debug("[BaseViews][Bases] Error refreshing view:", refreshError);
						}
					}
				}
			});

			return true;
		} catch (error) {
			console.warn("[BaseViews][Bases] Registration attempt failed:", error);
			return false;
		}
	};

	if (await attemptRegistration()) {
		return;
	}

	for (let i = 0; i < 5; i++) {
		await new Promise((r) => setTimeout(r, 200));
		if (await attemptRegistration()) {
			return;
		}
	}

	console.warn("[BaseViews][Bases] Failed to register views after multiple attempts");
}

// Unregister Base Views custom views.
export function unregisterBasesViews(plugin: TaskNotesPlugin): void {
	try {
		// Unregister only views that BaseViews itself registers.
		unregisterBasesView(plugin, "tasknotesTaskListCustom");
		unregisterBasesView(plugin, "tasknotesCustomTable");
	} catch (error) {
		console.error("[BaseViews][Bases] Error during view unregistration:", error);
	}
}
