import { FieldMapping, StatusConfig, PriorityConfig } from "../types";
import { BaseViewsSettings, CalendarViewSettings } from "../types/settings";

/**
 * Internal field names for default visible properties.
 * These are FieldMapping keys that will be converted to user-configured property names.
 */
export const DEFAULT_INTERNAL_VISIBLE_PROPERTIES: (keyof FieldMapping)[] = [
	"status",
	"priority",
	"due",
	"scheduled",
	"projects",
	"contexts",
];

// Default field mapping maintains backward compatibility
export const DEFAULT_FIELD_MAPPING: FieldMapping = {
	title: "title",
	status: "status",
	priority: "priority",
	due: "due",
	scheduled: "scheduled",
	contexts: "contexts",
	projects: "projects",
	timeEstimate: "timeEstimate",
	completedDate: "completedDate",
	dateCreated: "dateCreated",
	dateModified: "dateModified",
	recurrence: "recurrence",
	recurrenceAnchor: "recurrence_anchor",
	archiveTag: "archived",
	timeEntries: "timeEntries",
	completeInstances: "complete_instances",
	skippedInstances: "skipped_instances",
	blockedBy: "blockedBy",
	pomodoros: "pomodoros",
	icsEventId: "icsEventId",
	icsEventTag: "ics_event",
	googleCalendarEventId: "googleCalendarEventId",
	reminders: "reminders",
};

// Default status configuration matches current hardcoded behavior
export const DEFAULT_STATUSES: StatusConfig[] = [
	{
		id: "none",
		value: "none",
		label: "None",
		color: "#cccccc",
		isCompleted: false,
		order: 0,
		autoArchive: false,
		autoArchiveDelay: 5,
	},
	{
		id: "open",
		value: "open",
		label: "Open",
		color: "#808080",
		isCompleted: false,
		order: 1,
		autoArchive: false,
		autoArchiveDelay: 5,
	},
	{
		id: "in-progress",
		value: "in-progress",
		label: "In progress",
		color: "#0066cc",
		isCompleted: false,
		order: 2,
		autoArchive: false,
		autoArchiveDelay: 5,
	},
	{
		id: "done",
		value: "done",
		label: "Done",
		color: "#00aa00",
		isCompleted: true,
		order: 3,
		autoArchive: false,
		autoArchiveDelay: 5,
	},
];

// Default priority configuration matches current hardcoded behavior
export const DEFAULT_PRIORITIES: PriorityConfig[] = [
	{
		id: "none",
		value: "none",
		label: "None",
		color: "#cccccc",
		weight: 0,
	},
	{
		id: "low",
		value: "low",
		label: "Low",
		color: "#00aa00",
		weight: 1,
	},
	{
		id: "normal",
		value: "normal",
		label: "Normal",
		color: "#ffaa00",
		weight: 2,
	},
	{
		id: "high",
		value: "high",
		label: "High",
		color: "#ff0000",
		weight: 3,
	},
];

export const DEFAULT_CALENDAR_VIEW_SETTINGS: CalendarViewSettings = {
	timeFormat: "24",
};

export const DEFAULT_SETTINGS: BaseViewsSettings = {
	tasksFolder: "TaskNotes/Tasks",
	taskTag: "task",
	taskIdentificationMethod: "tag",
	hideIdentifyingTagsInCards: false,
	storeTitleInFilename: true,
	calendarViewSettings: DEFAULT_CALENDAR_VIEW_SETTINGS,
	uiLanguage: "en",

	singleClickAction: "edit",
	doubleClickAction: "openNote",

	fieldMapping: DEFAULT_FIELD_MAPPING,
	customStatuses: DEFAULT_STATUSES,
	customPriorities: DEFAULT_PRIORITIES,

	showExpandableSubtasks: true,
	subtaskChevronPosition: "right",
	hideCompletedFromOverdue: true,

	userFields: [],
	defaultVisibleProperties: [
		"status",
		"priority",
		"due",
		"scheduled",
		"projects",
		"contexts",
		"tags",
		"blocked",
		"blocking",
	],

	enableBases: true, // Legacy aggregate toggle (kept for backward compatibility)
	enableBasesCustomTableView: true,
	enableBasesTaskListCustomView: true,
	customTableShowIconicIconInNameColumn: true,
	customTableShowGroupingPropertyName: false,
	enableBasesViewListSidebar: true,
	basesViewListPlacement: "left",
	basesViewListSidePanePlacement: "top",
	basesViewListFontSize: "m",
	basesViewListShowProperty: true,
	basesViewListHideNativeToolbar: false,
	basesViewListShowIcons: true,
	basesViewListTopOverflowMode: "wrap",
	basesViewListNarrowBehavior: "top",
	basesViewListNarrowThresholdPx: 800,
	basesViewColorRgbHistory: [],

	useFrontmatterMarkdownLinks: false, // Default to wikilinks for compatibility
};
