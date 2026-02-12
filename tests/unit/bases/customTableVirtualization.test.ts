import {
	CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED,
	CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED,
	hasAnyTableSummary,
	shouldUseGroupedVirtualization,
	shouldUseUngroupedVirtualization,
} from "../../../src/bases/customTableVirtualization";
import { TableSummaryKey } from "../../../src/bases/tableSummary";

describe("customTableVirtualization thresholds", () => {
	test("ungrouped: threshold以上で仮想化が有効になる", () => {
		expect(
			shouldUseUngroupedVirtualization(
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED - 1,
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED
			)
		).toBe(false);

		expect(
			shouldUseUngroupedVirtualization(
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED,
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED
			)
		).toBe(true);
	});

	test("grouped: flatten後アイテム数がthreshold以上で仮想化が有効になる", () => {
		expect(
			shouldUseGroupedVirtualization(
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED - 1,
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED
			)
		).toBe(false);

		expect(
			shouldUseGroupedVirtualization(
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED,
				CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED
			)
		).toBe(true);
	});

	test("summary設定の有無を列単位で判定できる", () => {
		const columns = ["file.name", "task.status", "task.priority"];
		const summaries: Record<string, TableSummaryKey> = {
			"task.status": "filled",
		};

		expect(hasAnyTableSummary(columns, summaries)).toBe(true);
		expect(hasAnyTableSummary(columns, {})).toBe(false);
	});
});
