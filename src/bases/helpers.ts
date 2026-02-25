/* eslint-disable no-console */
import TaskNotesPlugin from "../main";
import { TaskInfo } from "../types";
import { calculateTotalTimeSpent } from "../utils/helpers";

export interface BasesDataItem {
	key?: string;
	data?: any;
	file?: { path?: string } | any;
	path?: string;
	properties?: Record<string, any>;
	frontmatter?: Record<string, any>;
	name?: string;
	basesData?: any; // Raw Bases data for formula computation
}

/**
 * Create TaskInfo object from a single Bases data item
 */
function createTaskInfoFromProperties(
	props: Record<string, any>,
	basesItem: BasesDataItem,
	plugin?: TaskNotesPlugin
): TaskInfo {
	// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
	const knownProperties = new Set([
		"title",
		"status",
		"priority",
		"archived",
		"due",
		"scheduled",
		"contexts",
		"projects",
		"tags",
		"timeEstimate",
		"completedDate",
		"recurrence",
		"dateCreated",
		"dateModified",
		"timeEntries",
		"reminders",
		"icsEventId",
		"complete_instances",
		"skipped_instances",
		"blockedBy",
		"blocking",
	]);

	const customProperties: Record<string, any> = {};
	Object.keys(props).forEach((key) => {
		if (!knownProperties.has(key)) {
			customProperties[key] = props[key];
		}
	});

	// Calculate total tracked time from time entries
	const totalTrackedTime = props.timeEntries
		? calculateTotalTimeSpent(props.timeEntries)
		: 0;

	// Get dependency information from DependencyCache if plugin is available
	let isBlocked = false;
	let blockingTasks: string[] = [];
	let isBlocking = false;
	if (plugin?.dependencyCache && basesItem.path) {
		// Use DependencyCache for status-aware blocking check
		isBlocked = plugin.dependencyCache.isTaskBlocked(basesItem.path);
		blockingTasks = plugin.dependencyCache.getBlockedTaskPaths(basesItem.path);
		isBlocking = blockingTasks.length > 0;
	} else {
		// Fallback when plugin not available: use simple existence check
		isBlocked = Array.isArray(props.blockedBy) && props.blockedBy.length > 0;
	}

	return {
		title:
			props.title ||
			basesItem.name ||
			basesItem.path?.split("/").pop()?.replace(".md", "") ||
			"Untitled",
		status: props.status || "open",
		priority: props.priority || "normal",
		path: basesItem.path || "",
		archived: props.archived || false,
		due: props.due,
		scheduled: props.scheduled,
		contexts: Array.isArray(props.contexts)
			? props.contexts
			: props.contexts
				? [props.contexts]
				: undefined,
		projects: Array.isArray(props.projects)
			? props.projects
			: props.projects
				? [props.projects]
				: undefined,
		tags: Array.isArray(props.tags) ? props.tags : props.tags ? [props.tags] : undefined,
		timeEstimate: props.timeEstimate,
		completedDate: props.completedDate,
		recurrence: props.recurrence,
		dateCreated: props.dateCreated,
		dateModified: props.dateModified,
		timeEntries: props.timeEntries,
		totalTrackedTime: totalTrackedTime,
		reminders: props.reminders,
		icsEventId: props.icsEventId,
		complete_instances: props.complete_instances,
		skipped_instances: props.skipped_instances,
		blockedBy: props.blockedBy,
		blocking: blockingTasks.length > 0 ? blockingTasks : undefined,
		isBlocked: isBlocked,
		isBlocking: isBlocking,
		customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined,
		basesData: basesItem.basesData,
	};
}

export function createTaskInfoFromBasesData(
	basesItem: BasesDataItem,
	plugin?: TaskNotesPlugin
): TaskInfo | null {
	// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
	if (!basesItem?.path) return null;

	const props = basesItem.properties || basesItem.frontmatter || {};

	if (plugin?.fieldMapper) {
		const mappedTaskInfo = plugin.fieldMapper.mapFromFrontmatter(
			props,
			basesItem.path,
			plugin.settings.storeTitleInFilename
		);
		const taskInfo = createTaskInfoFromProperties(mappedTaskInfo, basesItem, plugin);

		// Preserve file.* properties from original props (they won't be in mappedTaskInfo)
		const fileProperties: Record<string, any> = {};
		Object.keys(props).forEach(key => {
			if (key.startsWith('file.')) {
				fileProperties[key] = props[key];
			}
		});

		// Merge file properties with existing custom properties
		return {
			...taskInfo,
			customProperties: {
				...mappedTaskInfo.customProperties,
				...taskInfo.customProperties,
				...fileProperties,
			},
		};
	} else {
		return createTaskInfoFromProperties(props, basesItem, plugin);
	}
}

/**
 * Identify TaskNotes from Bases data by converting all items to TaskInfo
 */
export async function identifyTaskNotesFromBasesData(
	dataItems: BasesDataItem[],
	plugin?: TaskNotesPlugin,
	toTaskInfo?: (item: BasesDataItem, plugin?: TaskNotesPlugin) => TaskInfo | null
): Promise<TaskInfo[]> {
	const taskInfoConverter = toTaskInfo || createTaskInfoFromBasesData;
	const taskNotes: TaskInfo[] = [];
	for (const item of dataItems) {
		if (!item?.path) continue;
		try {
			const taskInfo = taskInfoConverter(item, plugin);
			if (taskInfo) taskNotes.push(taskInfo);
		} catch (error) {
			console.warn("[TaskNotes][BasesPOC] Error converting Bases item to TaskInfo:", error);
		}
	}
	return taskNotes;
}
