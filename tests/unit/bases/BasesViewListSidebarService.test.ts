import { TFile } from "obsidian";
import { BasesViewListSidebarService } from "../../../src/bases/BasesViewListSidebarService";

interface EventRefLike {
	event: string;
	callback: (...args: unknown[]) => void;
}

class MockEventBus {
	private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

	on(event: string, callback: (...args: unknown[]) => void): EventRefLike {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(callback);
		return { event, callback };
	}

	offref(ref: EventRefLike): void {
		this.listeners.get(ref.event)?.delete(ref.callback);
	}

	trigger(event: string, ...args: unknown[]): void {
		for (const callback of this.listeners.get(event) ?? []) {
			callback(...args);
		}
	}
}

class MockWorkspace extends MockEventBus {
	leaves: any[] = [];
	openLinkText = jest.fn().mockResolvedValue(undefined);
	setActiveLeaf = jest.fn();
	getLeavesOfType = jest.fn((type: string) => {
		return this.leaves.filter((leaf) => leaf.view?.getViewType?.() === type);
	});
}

const flushTimersAndPromises = async (rounds = 2): Promise<void> => {
	for (let i = 0; i < rounds; i += 1) {
		jest.runOnlyPendingTimers();
		await Promise.resolve();
	}
};

function createBaseLeaf(options: {
	filePath?: string;
	currentViewName?: string;
	controller?: Record<string, unknown>;
}) {
	const filePath = options.filePath ?? "Guides/test.base";
	const currentViewName = options.currentViewName ?? "Table";

	const rootEl = document.createElement("div");
	rootEl.className = "view-content";

	const toolbarEl = document.createElement("div");
	toolbarEl.className = "bases-toolbar";

	const viewsMenuEl = document.createElement("div");
	viewsMenuEl.className = "bases-toolbar-item bases-toolbar-views-menu";
	const buttonEl = document.createElement("div");
	buttonEl.className = "text-icon-button";
	const labelEl = document.createElement("span");
	labelEl.className = "text-button-label";
	labelEl.textContent = currentViewName;
	buttonEl.appendChild(labelEl);
	viewsMenuEl.appendChild(buttonEl);
	toolbarEl.appendChild(viewsMenuEl);
	rootEl.appendChild(toolbarEl);

	const basesViewEl = document.createElement("div");
	basesViewEl.className = "bases-view";
	rootEl.appendChild(basesViewEl);

	document.body.appendChild(rootEl);

	const file = new TFile(filePath);
	const controller = {
		viewName: currentViewName,
		...(options.controller ?? {}),
	};

	const leaf = {
		view: {
			getViewType: () => "bases",
			file,
			controller,
			containerEl: rootEl,
		},
	};

	return { leaf, rootEl, toolbarEl, labelEl, basesViewEl, controller };
}

describe("BasesViewListSidebarService", () => {
	let workspace: MockWorkspace;
	let emitter: MockEventBus;
	let plugin: any;
	let service: BasesViewListSidebarService;
	let vaultCachedRead: jest.Mock;
	let mountedRoots: HTMLElement[];

	beforeEach(() => {
		jest.useFakeTimers();

		workspace = new MockWorkspace();
		emitter = new MockEventBus();
		vaultCachedRead = jest.fn().mockResolvedValue("");
		mountedRoots = [];

		plugin = {
			settings: {
				enableBases: true,
				enableBasesViewListSidebar: true,
				basesViewListDropdownMode: "list-only",
				basesViewListCollapsed: false,
				basesViewListWidthPx: 220,
			},
			app: {
				workspace,
				vault: {
					cachedRead: vaultCachedRead,
				},
				internalPlugins: {
					getEnabledPluginById: jest.fn(() => ({
						registrations: {
							table: { icon: "lucide-table" },
							cards: { icon: "lucide-layout-grid" },
							list: { icon: "lucide-list" },
							tasknotesCustomTable: { icon: "table" },
							invalidIconType: { icon: "not a valid icon !!" },
						},
					})),
				},
			},
			emitter,
			saveSettings: jest.fn().mockResolvedValue(undefined),
			i18n: {
				translate: (key: string) => {
					const translations: Record<string, string> = {
						"settings.integrations.basesIntegration.viewListSidebar.title": "Views",
						"settings.integrations.basesIntegration.viewListSidebar.openButton.ariaLabel":
							"Open view list",
						"settings.integrations.basesIntegration.viewListSidebar.openButton.tooltip":
							"Open view list",
						"settings.integrations.basesIntegration.viewListSidebar.closeButton.ariaLabel":
							"Close view list",
						"settings.integrations.basesIntegration.viewListSidebar.closeButton.tooltip":
							"Close view list",
						"settings.integrations.basesIntegration.viewListSidebar.resizeHandle.ariaLabel":
							"Resize view list width",
						"settings.integrations.basesIntegration.viewListSidebar.resizeHandle.tooltip":
							"Drag to resize",
					};
					return translations[key] ?? key;
				},
			},
		};

		service = new BasesViewListSidebarService(plugin);
	});

	afterEach(() => {
		service.stop();
		for (const root of mountedRoots) {
			root.remove();
		}
		mountedRoots = [];
		jest.useRealTimers();
	});

	it("renders view entries with icons from registrations", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "custom view", type: "tasknotesCustomTable" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item"));
		expect(items.map((item) => item.textContent?.trim())).toEqual(["Table", "custom view"]);

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons).toEqual(["table", "table"]);
	});

	it("falls back to generic icon when type is unknown", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Unknown", type: "not-registered-type" },
						{ name: "List", type: "list" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons[0]).toBe("list");
		expect(icons[1]).toBe("list");
	});

	it("falls back to generic icon when registration icon id is invalid", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [{ name: "Invalid", type: "invalidIconType" }],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons).toEqual(["list"]);
	});

	it("falls back to YAML parsing when controller views are unavailable", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {},
				getQueryViewNames: () => [],
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		vaultCachedRead.mockResolvedValue(
			`views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards`
		);

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item"));
		expect(items.map((item) => item.textContent?.trim())).toEqual(["Table", "Cards"]);
	});

	it("switches view via selectView when available", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "custom view", type: "tasknotesCustomTable" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")[1];
		targetButton.click();
		await flushTimersAndPromises();

		expect(selectView).toHaveBeenCalledWith("custom view");
		expect(workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("falls back to openLinkText when selectView throws", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/test.base",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "custom view", type: "tasknotesCustomTable" },
					],
				},
				selectView: () => {
					throw new Error("unavailable");
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")[1];
		targetButton.click();
		await flushTimersAndPromises();

		expect(workspace.setActiveLeaf).toHaveBeenCalledWith(setup.leaf, { focus: false });
		expect(workspace.openLinkText).toHaveBeenCalledWith("Guides/test.base#custom view", "Guides/test.base", false);
	});

	it("hides sidebar and toolbar trigger when only one view exists", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-open-trigger")).toBeNull();
	});

	it("shows toolbar open trigger when collapsed and reopens on click", async () => {
		plugin.settings.basesViewListCollapsed = true;
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		const triggerButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".tn-bases-view-list-open-trigger button"
		);
		expect(triggerButton).not.toBeNull();

		triggerButton?.click();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListCollapsed).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).not.toBeNull();
	});

	it("closes list via header close button", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const closeButton = setup.rootEl.querySelector<HTMLButtonElement>(".tn-bases-view-list__close");
		expect(closeButton).not.toBeNull();

		closeButton?.click();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListCollapsed).toBe(true);
		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-open-trigger")).not.toBeNull();
	});

	it("resizes view list width and persists on pointerup", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list-layout");
		const resizerEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__resizer");
		expect(layoutEl).not.toBeNull();
		expect(resizerEl).not.toBeNull();

		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 220 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 320 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 320 }));
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListWidthPx).toBe(320);
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("320px");
		expect(plugin.saveSettings).toHaveBeenCalled();
	});

	it("clamps resized width to min/max bounds", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list-layout");
		const resizerEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__resizer");
		expect(layoutEl).not.toBeNull();
		expect(resizerEl).not.toBeNull();

		// Drag far right -> max clamp (520)
		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 220 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 2000 }));
		await flushTimersAndPromises(3);
		expect(plugin.settings.basesViewListWidthPx).toBe(520);
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("520px");

		// Drag far left -> min clamp (140)
		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 520 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: -2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: -2000 }));
		await flushTimersAndPromises(3);
		expect(plugin.settings.basesViewListWidthPx).toBe(140);
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("140px");
	});

	it("does not duplicate layout or trigger on repeated settings refresh", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "custom view", type: "tasknotesCustomTable" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		for (let i = 0; i < 4; i += 1) {
			emitter.trigger("settings-changed");
			await flushTimersAndPromises();
		}

		expect(setup.rootEl.querySelectorAll(".tn-bases-view-list-layout")).toHaveLength(1);
		expect(setup.rootEl.querySelectorAll(".tn-bases-view-list-open-trigger")).toHaveLength(0);
		expect(setup.rootEl.querySelectorAll(".tn-bases-view-list__resizer")).toHaveLength(1);
	});
});
