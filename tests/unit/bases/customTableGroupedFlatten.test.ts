import {
	flattenGroupedVirtualItems,
	GroupedVirtualSource,
} from "../../../src/bases/customTableVirtualization";

type MockEntry = {
	id: string;
};

describe("flattenGroupedVirtualItems", () => {
	test("group header -> group summary -> rows の順でフラット化する", () => {
		const groups: GroupedVirtualSource<MockEntry>[] = [
			{
				id: "g1",
				title: "Group 1",
				entries: [{ id: "a" }, { id: "b" }],
				summaryValues: { "task.status": "2" },
			},
			{
				id: "g2",
				title: "Group 2",
				entries: [{ id: "c" }],
			},
		];

		const items = flattenGroupedVirtualItems(groups);

		expect(items.map((item) => item.type)).toEqual([
			"group-header",
			"group-summary",
			"row",
			"row",
			"group-header",
			"row",
		]);

		expect(items[0]).toMatchObject({
			type: "group-header",
			groupId: "g1",
			title: "Group 1",
			count: 2,
		});
		expect(items[1]).toMatchObject({
			type: "group-summary",
			groupId: "g1",
			summaryValues: { "task.status": "2" },
		});
		expect(items[2]).toMatchObject({
			type: "row",
			groupId: "g1",
			entry: { id: "a" },
		});
		expect(items[5]).toMatchObject({
			type: "row",
			groupId: "g2",
			entry: { id: "c" },
		});
	});

	test("summaryValues が空オブジェクトの場合は group-summary を生成しない", () => {
		const groups: GroupedVirtualSource<MockEntry>[] = [
			{
				id: "g1",
				title: "Group 1",
				entries: [{ id: "a" }],
				summaryValues: {},
			},
		];

		const items = flattenGroupedVirtualItems(groups);
		expect(items.map((item) => item.type)).toEqual(["group-header", "row"]);
	});
});
