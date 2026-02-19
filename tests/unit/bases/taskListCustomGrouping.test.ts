import { TaskListViewCustom } from "../../../src/bases/TaskListViewCustom";

describe("TaskListViewCustom grouping", () => {
	const createView = () => {
		const plugin = {
			fieldMapper: {},
			settings: {},
		} as any;
		return new TaskListViewCustom({}, document.createElement("div"), plugin);
	};

	it("unnest ON で list値を複数サブグループへ展開する", () => {
		const view = createView() as any;
		view.unnestMultiValueGroup = true;

		const tasks = [
			{ path: "A.md", title: "A", status: "open", priority: "normal" },
			{ path: "B.md", title: "B", status: "open", priority: "normal" },
		] as any[];

		const pathToProps = new Map<string, Record<string, any>>([
			["A.md", { tags: ["alpha", "beta"] }],
			["B.md", { tags: ["beta"] }],
		]);

		const groups = view.groupTasksBySubProperty(
			tasks,
			"note.tags",
			pathToProps,
			new Map()
		) as Map<string, any[]>;

		expect(Array.from(groups.keys())).toEqual(["alpha", "beta"]);
		expect(groups.get("alpha")?.map((task) => task.path)).toEqual(["A.md"]);
		expect(groups.get("beta")?.map((task) => task.path)).toEqual(["A.md", "B.md"]);
	});

	it("unnest OFF で list値を結合キー1件へまとめる", () => {
		const view = createView() as any;
		view.unnestMultiValueGroup = false;

		const tasks = [
			{ path: "A.md", title: "A", status: "open", priority: "normal" },
		] as any[];

		const pathToProps = new Map<string, Record<string, any>>([
			["A.md", { tags: ["alpha", "beta"] }],
		]);

		const groups = view.groupTasksBySubProperty(
			tasks,
			"note.tags",
			pathToProps,
			new Map()
		) as Map<string, any[]>;

		expect(Array.from(groups.keys())).toEqual(["alpha, beta"]);
		expect(groups.get("alpha, beta")?.map((task) => task.path)).toEqual(["A.md"]);
	});

	it("1段階目グルーピングでも unnest ON なら list値を複数グループへ展開する", () => {
		const view = createView() as any;
		view.unnestMultiValueGroup = true;
		view.basesController = {
			viewName: "task-list-custom-test",
			query: {
				views: [
					{
						name: "task-list-custom-test",
						groupBy: { property: "note.tags", direction: "ASC" },
					},
				],
			},
		};

		const entryA = { file: { path: "A.md" }, properties: { tags: ["alpha", "beta"] } };
		const entryB = { file: { path: "B.md" }, properties: { tags: ["beta"] } };
		view.data = {
			data: [entryA, entryB],
			groupedData: [
				{ key: "alpha, beta", entries: [entryA] },
				{ key: "beta", entries: [entryB] },
			],
		};

		const primaryGroups = view.resolvePrimaryGroups([
			{ path: "A.md", title: "A", status: "open", priority: "normal" },
			{ path: "B.md", title: "B", status: "open", priority: "normal" },
		]) as Array<{ key: string; tasks: Array<{ path: string }> }>;

		expect(primaryGroups.map((group) => group.key)).toEqual(["alpha", "beta"]);
		expect(primaryGroups[0].tasks.map((task) => task.path)).toEqual(["A.md"]);
		expect(primaryGroups[1].tasks.map((task) => task.path)).toEqual(["A.md", "B.md"]);
	});

	it("1段階目グルーピングで unnest OFF の場合は Bases のグループをそのまま使う", () => {
		const view = createView() as any;
		view.unnestMultiValueGroup = false;
		view.basesController = {
			viewName: "task-list-custom-test",
			query: {
				views: [
					{
						name: "task-list-custom-test",
						groupBy: { property: "note.tags", direction: "ASC" },
					},
				],
			},
		};

		const entryA = { file: { path: "A.md" }, properties: { tags: ["alpha", "beta"] } };
		const entryB = { file: { path: "B.md" }, properties: { tags: ["beta"] } };
		view.data = {
			data: [entryA, entryB],
			groupedData: [
				{ key: "alpha, beta", entries: [entryA] },
				{ key: "beta", entries: [entryB] },
			],
		};

		const primaryGroups = view.resolvePrimaryGroups([
			{ path: "A.md", title: "A", status: "open", priority: "normal" },
			{ path: "B.md", title: "B", status: "open", priority: "normal" },
		]) as Array<{ key: string; tasks: Array<{ path: string }> }>;

		expect(primaryGroups.map((group) => group.key)).toEqual(["alpha, beta", "beta"]);
		expect(primaryGroups[0].tasks.map((task) => task.path)).toEqual(["A.md"]);
		expect(primaryGroups[1].tasks.map((task) => task.path)).toEqual(["B.md"]);
	});

	it("file.ext は file.extension からフォールバック解決できる", () => {
		const view = createView() as any;
		view.unnestMultiValueGroup = true;

		const tasks = [
			{ path: "A.md", title: "A", status: "open", priority: "normal" },
		] as any[];

		const pathToProps = new Map<string, Record<string, any>>([
			["A.md", { "file.extension": "md" }],
		]);

		const groups = view.groupTasksBySubProperty(
			tasks,
			"file.ext",
			pathToProps,
			new Map()
		) as Map<string, any[]>;

		expect(Array.from(groups.keys())).toEqual(["md"]);
		expect(groups.get("md")?.map((task) => task.path)).toEqual(["A.md"]);
	});

	it("readViewOptions は unnestMultiValueGroup の文字列値を boolean として解釈する", () => {
		const view = createView() as any;
		view.config = {
			getAsPropertyId: jest.fn(() => "note.tags"),
			get: jest.fn((key: string) => (key === "unnestMultiValueGroup" ? "false" : undefined)),
		};

		view.readViewOptions();

		expect(view.subGroupPropertyId).toBe("note.tags");
		expect(view.unnestMultiValueGroup).toBe(false);
	});

	it("onDataUpdated は設定変更時に即時再描画し、通常更新はデバウンスする", () => {
		jest.useFakeTimers();
		try {
			const view = createView() as any;
			const root = document.createElement("div");
			document.body.appendChild(root);
			view.rootElement = root;
			view.data = {
				groupedData: [{ hasKey: () => false, entries: [] }],
			};
			view.config = {
				getOrder: jest.fn(() => []),
				getSort: jest.fn(() => []),
				getAsPropertyId: jest.fn(() => ""),
				get: jest.fn((key: string) =>
					key === "unnestMultiValueGroup" ? true : undefined
				),
			};

			const renderSpy = jest
				.spyOn(view, "render")
				.mockImplementation(() => Promise.resolve());

			// First update: immediate render
			view.onDataUpdated();
			jest.runOnlyPendingTimers();
			expect(renderSpy).toHaveBeenCalledTimes(1);

			// Regular update: debounced (300ms)
			view.onDataUpdated();
			expect(renderSpy).toHaveBeenCalledTimes(1);
			jest.advanceTimersByTime(299);
			expect(renderSpy).toHaveBeenCalledTimes(1);
			jest.advanceTimersByTime(1);
			expect(renderSpy).toHaveBeenCalledTimes(2);

			// Config change: immediate render
			(view.config.getAsPropertyId as jest.Mock).mockReturnValue("note.tags");
			view.onDataUpdated();
			jest.runOnlyPendingTimers();
			expect(renderSpy).toHaveBeenCalledTimes(3);

			renderSpy.mockRestore();
			root.remove();
		} finally {
			jest.useRealTimers();
		}
	});
});
