import { registerBasesTaskList } from "../../../src/bases/registration";
import { registerBasesView } from "../../../src/bases/api";

jest.mock("../../../src/bases/api", () => ({
	registerBasesView: jest.fn(() => true),
	unregisterBasesView: jest.fn(() => true),
}));

describe("registerBasesTaskList task list custom options", () => {
	beforeEach(() => {
		(registerBasesView as jest.Mock).mockClear().mockReturnValue(true);
	});

	const createPlugin = () =>
		({
			settings: {
				enableBases: true,
				calendarViewSettings: {},
			},
			app: {},
			i18n: {
				translate: (key: string) => key,
			},
		}) as any;

	const getTaskListCustomOptions = async () => {
		await registerBasesTaskList(createPlugin());
		const taskListCustomCall = (registerBasesView as jest.Mock).mock.calls.find(
			(args: unknown[]) => args[1] === "tasknotesTaskListCustom"
		);
		expect(taskListCustomCall).toBeDefined();
		const registration = taskListCustomCall?.[2] as {
			options?: () => Array<Record<string, unknown>>;
		};
		return registration.options?.() ?? [];
	};

	it("does not include legacy enableSearch option", async () => {
		const options = await getTaskListCustomOptions();
		const enableSearchOption = options.find(
			(option) => option.type === "toggle" && option.key === "enableSearch"
		);
		expect(enableSearchOption).toBeUndefined();
	});

	it("includes unnestMultiValueGroup toggle with default true", async () => {
		const options = await getTaskListCustomOptions();
		const unnestOption = options.find(
			(option) => option.type === "toggle" && option.key === "unnestMultiValueGroup"
		) as { default?: boolean } | undefined;

		expect(unnestOption).toBeDefined();
		expect(unnestOption?.default).toBe(true);
	});

	it("allows sub-group by for note/task/formula and selected file.* properties only", async () => {
		const options = await getTaskListCustomOptions();
		const subGroupOption = options.find(
			(option) => option.type === "property" && option.key === "subGroup"
		) as { filter?: (prop: string) => boolean } | undefined;
		expect(subGroupOption).toBeDefined();
		expect(typeof subGroupOption?.filter).toBe("function");

		const filter = subGroupOption?.filter as (prop: string) => boolean;

		expect(filter("note.status")).toBe(true);
		expect(filter("task.priority")).toBe(true);
		expect(filter("formula.score")).toBe(true);

		expect(filter("file.folder")).toBe(true);
		expect(filter("file.ext")).toBe(true);
		expect(filter("file.size")).toBe(true);
		expect(filter("file.links")).toBe(true);
		expect(filter("file.backlinks")).toBe(true);
		expect(filter("file.embeds")).toBe(true);
		expect(filter("file.tags")).toBe(true);

		expect(filter("file.name")).toBe(false);
		expect(filter("file.path")).toBe(false);
		expect(filter("file.ctime")).toBe(false);
		expect(filter("file.extension")).toBe(false);
	});
});
