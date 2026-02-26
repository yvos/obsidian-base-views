import { unregisterBasesViews } from "../../../src/bases/registration";
import { unregisterBasesView } from "../../../src/bases/api";

jest.mock("../../../src/bases/api", () => ({
	registerBasesView: jest.fn(() => true),
	unregisterBasesView: jest.fn(() => true),
}));

describe("unregisterBasesViews", () => {
	beforeEach(() => {
		(unregisterBasesView as jest.Mock).mockClear().mockReturnValue(true);
	});

	const createPlugin = () =>
		({
			app: {},
			settings: {},
		}) as any;

	it("unregisters only BaseViews custom view ids", () => {
		unregisterBasesViews(createPlugin());

		expect(unregisterBasesView).toHaveBeenCalledTimes(2);

		const calledIds = (unregisterBasesView as jest.Mock).mock.calls.map(
			(args: unknown[]) => args[1]
		);

		expect(calledIds).toEqual(["tasknotesTaskListCustom", "tasknotesCustomTable"]);
		expect(calledIds).not.toContain("tasknotesTaskList");
		expect(calledIds).not.toContain("tasknotesKanban");
		expect(calledIds).not.toContain("tasknotesCalendar");
		expect(calledIds).not.toContain("tasknotesMiniCalendar");
	});
});
