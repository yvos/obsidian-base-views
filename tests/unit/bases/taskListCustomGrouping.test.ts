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
});
