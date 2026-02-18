import { registerBasesTaskList } from "../../../src/bases/registration";
import { registerBasesView } from "../../../src/bases/api";

jest.mock("../../../src/bases/api", () => ({
	registerBasesView: jest.fn(() => true),
	unregisterBasesView: jest.fn(() => true),
}));

describe("registerBasesTaskList custom table rowHeight options", () => {
	beforeEach(() => {
		(registerBasesView as jest.Mock).mockClear().mockReturnValue(true);
	});

	it("includes veryShort in tasknotesCustomTable rowHeight dropdown", async () => {
		const plugin = {
			settings: {
				enableBases: true,
				calendarViewSettings: {},
			},
			app: {},
			i18n: {
				translate: (key: string) => key,
			},
		} as any;

		await registerBasesTaskList(plugin);

		const customTableCall = (registerBasesView as jest.Mock).mock.calls.find(
			(args: unknown[]) => args[1] === "tasknotesCustomTable"
		);
		expect(customTableCall).toBeDefined();

		const registration = customTableCall?.[2] as {
			options?: () => Array<Record<string, unknown>>;
		};
		const options = registration.options?.() ?? [];
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
});
