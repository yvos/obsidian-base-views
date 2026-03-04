import { FieldMapping, StatusConfig, PriorityConfig } from "../types";

export interface FileFilterConfig {
	requiredTags?: string[];
	includeFolders?: string[];
	propertyKey?: string;
	propertyValue?: string;
}

export interface UserMappedField {
	id: string; // stable id used in filters (e.g., 'effort')
	displayName: string;
	key: string; // frontmatter key
	type: "text" | "number" | "date" | "boolean" | "list";
	autosuggestFilter?: FileFilterConfig; // Optional filter configuration for file suggestions
	defaultValue?: string | number | boolean | string[]; // Default value for the field
}

export interface CalendarViewSettings {
	timeFormat: "12" | "24"; // 12-hour or 24-hour format
}

export interface BaseViewsSettings {
	tasksFolder: string; // Default location for new tasks
	taskTag: string; // The tag that identifies tasks
	taskIdentificationMethod: "tag" | "property"; // Method to identify tasks
	hideIdentifyingTagsInCards: boolean; // Hide identifying tags in task card displays
	storeTitleInFilename: boolean;
	calendarViewSettings: CalendarViewSettings;
	uiLanguage: string; // supported locale code for UI translations (Base Views: 'en' | 'ja')

	singleClickAction: "edit" | "openNote";
	doubleClickAction: "edit" | "openNote" | "none";

	fieldMapping: FieldMapping;
	customStatuses: StatusConfig[];
	customPriorities: PriorityConfig[];

	showExpandableSubtasks: boolean;
	subtaskChevronPosition: "left" | "right";
	hideCompletedFromOverdue: boolean;

	userFields?: UserMappedField[];
	defaultVisibleProperties?: string[];

	enableBases: boolean; // Legacy aggregate toggle (derived from feature-specific toggles)
	enableBasesCustomTableView: boolean; // Enable Table View (Custom) registration
	enableBasesTaskListCustomView: boolean; // Enable Task List View (Custom) registration
	customTableShowIconicIconInNameColumn: boolean; // Show Iconic file icon before file name in Custom Table view
	customTableShowGroupingPropertyName: boolean; // Show grouped headers as "property: value" in Custom Table view
	enableBasesViewListSidebar: boolean; // Show Base view list sidebar for .base files

	basesViewListPlacement: "left" | "top" | "none" | "formulaOnly"; // Default placement for main pane
	basesViewListSidePanePlacement: "left" | "top" | "none" | "formulaOnly"; // Default placement for side pane
	basesViewListFontSize: "m" | "s" | "xs"; // Font size for view rows
	basesViewListShowProperty: boolean; // Show description text under view name
	basesViewListHideNativeToolbar: boolean; // Hide/show native Bases header+toolbar when list is visible
	basesViewListShowIcons: boolean; // Show/hide view icons in the list
	basesViewListTopOverflowMode: "wrap" | "scroll"; // Top layout overflow behavior
	basesViewListNarrowBehavior: "none" | "top" | "hide"; // Behavior when pane width is narrow
	basesViewListNarrowThresholdPx: number; // Narrow pane threshold in px
	basesViewColorRgbHistory: string[]; // Global history for RGB input in Base view color menu (max 5)

	useFrontmatterMarkdownLinks: boolean; // Use markdown links in frontmatter
}
