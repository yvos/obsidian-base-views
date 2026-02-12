import { TableSummaryKey } from "./tableSummary";

export const CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED = 200;
export const CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED = 300;
export const CUSTOM_TABLE_VIRTUAL_OVERSCAN = 6;

export interface GroupedVirtualSource<TEntry> {
	id: string;
	title: string;
	entries: TEntry[];
	summaryValues?: Record<string, string>;
}

export type VirtualGroupedItem<TEntry> =
	| {
		type: "group-header";
		id: string;
		groupId: string;
		title: string;
		count: number;
	}
	| {
		type: "group-summary";
		id: string;
		groupId: string;
		summaryValues: Record<string, string>;
	}
	| {
		type: "row";
		id: string;
		groupId: string;
		entry: TEntry;
	};

export function shouldUseUngroupedVirtualization(
	entryCount: number,
	threshold = CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED
): boolean {
	return entryCount >= threshold;
}

export function shouldUseGroupedVirtualization(
	flattenedItemCount: number,
	threshold = CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED
): boolean {
	return flattenedItemCount >= threshold;
}

export function flattenGroupedVirtualItems<TEntry>(
	groups: GroupedVirtualSource<TEntry>[]
): VirtualGroupedItem<TEntry>[] {
	const items: VirtualGroupedItem<TEntry>[] = [];

	for (const group of groups) {
		items.push({
			type: "group-header",
			id: `header:${group.id}`,
			groupId: group.id,
			title: group.title,
			count: group.entries.length,
		});

		const hasSummary = !!group.summaryValues && Object.keys(group.summaryValues).length > 0;
		if (hasSummary) {
			items.push({
				type: "group-summary",
				id: `summary:${group.id}`,
				groupId: group.id,
				summaryValues: group.summaryValues || {},
			});
		}

		for (let i = 0; i < group.entries.length; i++) {
			items.push({
				type: "row",
				id: `row:${group.id}:${i}`,
				groupId: group.id,
				entry: group.entries[i],
			});
		}
	}

	return items;
}

export function hasAnyTableSummary(
	columns: string[],
	summaries: Record<string, TableSummaryKey>
): boolean {
	return columns.some((column) => !!summaries[column]);
}
