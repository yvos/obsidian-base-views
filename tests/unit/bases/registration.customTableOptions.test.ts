import { registerBasesTaskList } from "../../../src/bases/registration";
import { registerBasesView } from "../../../src/bases/api";

jest.mock("../../../src/bases/api", () => ({
	registerBasesView: jest.fn(() => true),
	unregisterBasesView: jest.fn(() => true),
}));

describe("registerBasesTaskList custom table options", () => {
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

	const getCustomTableOptions = async () => {
		await registerBasesTaskList(createPlugin());
		const customTableCall = (registerBasesView as jest.Mock).mock.calls.find(
			(args: unknown[]) => args[1] === "tasknotesCustomTable"
		);
		expect(customTableCall).toBeDefined();
		const registration = customTableCall?.[2] as {
			options?: () => Array<Record<string, unknown>>;
		};
		return registration.options?.() ?? [];
	};

	it("includes veryShort in tasknotesCustomTable rowHeight dropdown", async () => {
		const options = await getCustomTableOptions();
		const rowHeightOption = options.find(
			(option) => option.type === "dropdown" && option.key === "rowHeight"
		) as { options?: Record<string, string> } | undefined;

		expect(rowHeightOption).toBeDefined();
		expect(rowHeightOption?.options?.veryShort).toBe("Very short");
		expect(rowHeightOption?.options?.short).toBe("Short");
		expect(rowHeightOption?.options?.medium).toBe("Medium");
		expect(rowHeightOption?.options?.tall).toBe("Tall");
		expect(rowHeightOption?.options?.extraTall).toBe("Extra tall");
	});

	it("allows sub-group by for note/task/formula and selected file.* properties only", async () => {
		const options = await getCustomTableOptions();
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
