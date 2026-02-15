import { Menu, TFile, parseYaml } from "obsidian";
import { BasesViewListSidebarService } from "../../../src/bases/BasesViewListSidebarService";
import { showTextInputModal } from "../../../src/modals/TextInputModal";

jest.mock("../../../src/modals/TextInputModal", () => ({
	showTextInputModal: jest.fn(),
}));

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
	setLeafWidth(rootEl, 1200);

	const headerEl = document.createElement("div");
	headerEl.className = "bases-header";
	rootEl.appendChild(headerEl);

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

	return { leaf, rootEl, headerEl, toolbarEl, labelEl, basesViewEl, controller };
}

function setLeafWidth(rootEl: HTMLElement, width: number): void {
	Object.defineProperty(rootEl, "clientWidth", {
		value: width,
		configurable: true,
	});
}

describe("BasesViewListSidebarService", () => {
	let workspace: MockWorkspace;
	let emitter: MockEventBus;
	let plugin: any;
	let service: BasesViewListSidebarService;
	let vaultCachedRead: jest.Mock;
	let vaultModify: jest.Mock;
	let mountedRoots: HTMLElement[];

	beforeEach(() => {
		jest.useFakeTimers();
		workspace = new MockWorkspace();
		emitter = new MockEventBus();
		vaultCachedRead = jest.fn().mockResolvedValue("");
		vaultModify = jest.fn().mockResolvedValue(undefined);
		mountedRoots = [];

		plugin = {
			settings: {
				enableBases: true,
				enableBasesViewListSidebar: true,
				basesViewListDropdownMode: "list-only",
				basesViewListCollapsed: false,
				basesViewListPlacement: "left",
				basesViewListFontSize: "m",
				basesViewListShowProperty: true,
				basesViewListPropertyKey: "description",
				basesViewListShowNativeToolbar: true,
				basesViewListShowIcons: true,
				basesViewListTopOverflowMode: "wrap",
				basesViewListNarrowBehavior: "top",
				basesViewListNarrowThresholdPx: 800,
			},
			app: {
				workspace,
				vault: {
					cachedRead: vaultCachedRead,
					modify: vaultModify,
				},
				internalPlugins: {
					getEnabledPluginById: jest.fn(() => ({
						registrations: {
							table: { icon: "lucide-table" },
							cards: { icon: "lucide-layout-grid" },
							list: { icon: "lucide-list" },
							tasknotesCustomTable: { icon: "table-cells-merge" },
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
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showLeft":
							"Show on left",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showTop":
							"Show on top",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showProperty":
							"Show property",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideProperty":
							"Hide property",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showNativeToolbar":
							"Show native toolbar",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideNativeToolbar":
							"Hide native toolbar",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.editDescription":
							"Edit description",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeDefault":
							"Font size: Default",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeSmall":
							"Font size: Small",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeVerySmall":
							"Font size: Very Small",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.redrawViewList":
							"Redraw view list",
						"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.title":
							"Edit description: {viewName}",
						"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.placeholder":
							"Enter description",
						"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.confirm":
							"Save",
						"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.cancel":
							"Cancel",
					};
					return translations[key] ?? key;
				},
			},
		};

		(showTextInputModal as jest.Mock).mockResolvedValue(null);

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
						{ name: "Table", type: "table", description: "Main" },
						{ name: "custom view", type: "tasknotesCustomTable", description: "Custom" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item"));
		expect(items).toHaveLength(2);

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons).toEqual(["table", "table-cells-merge"]);
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
			`views:\n  - type: table\n    name: Table\n    description: Alpha\n  - type: cards\n    name: Cards\n    description: Beta`
		);

		service.start();
		await flushTimersAndPromises();

		const names = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-name")
		).map((el) => el.textContent?.trim());
		expect(names).toEqual(["Table", "Cards"]);

		const props = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-property")
		).map((el) => el.textContent?.trim());
		expect(props).toEqual(["Alpha", "Beta"]);
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
		expect(workspace.openLinkText).toHaveBeenCalledWith(
			"Guides/test.base#custom view",
			"Guides/test.base",
			false
		);
	});

	it("hides sidebar and toolbar trigger when only one view exists", async () => {
		plugin.settings.basesViewListShowNativeToolbar = false;
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
		expect(setup.rootEl.querySelector(".tn-bases-view-list-top-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-open-trigger")).toBeNull();
		expect(setup.rootEl.classList.contains("tn-bases-native-toolbar-hidden")).toBe(false);
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

	it("forces native toolbar visible when list is collapsed even if toolbar setting is off", async () => {
		plugin.settings.basesViewListShowNativeToolbar = false;
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

		expect(setup.rootEl.classList.contains("tn-bases-native-toolbar-hidden")).toBe(false);
		expect(setup.rootEl.querySelector(".tn-bases-view-list-open-trigger")).not.toBeNull();
	});

	it("renders left header title as base filename and uses small close icon class", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/Base-all.base",
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

		const titleEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__title");
		expect(titleEl?.textContent?.trim()).toBe("Base-all");

		const closeButton = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__close");
		expect(closeButton?.classList.contains("tn-bases-view-list__close--small")).toBe(true);
	});

	it("renders top placement under bases-header with close button only", async () => {
		plugin.settings.basesViewListPlacement = "top";
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

		const topLayout = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list-top-layout");
		expect(topLayout).not.toBeNull();
		expect(setup.headerEl.nextElementSibling).toBe(topLayout);
		expect(topLayout?.querySelector(".tn-bases-view-list__title")).toBeNull();
		expect(topLayout?.querySelector(".tn-bases-view-list__close")).not.toBeNull();
	});

	it("applies top overflow class as horizontal scroll", async () => {
		plugin.settings.basesViewListPlacement = "top";
		plugin.settings.basesViewListTopOverflowMode = "scroll";
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

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl?.classList.contains("tn-bases-view-list--top")).toBe(true);
		expect(listEl?.classList.contains("tn-bases-view-list--top-scroll")).toBe(true);
		expect(listEl?.classList.contains("tn-bases-view-list--top-wrap")).toBe(false);
	});

	it("applies font-size class by setting", async () => {
		plugin.settings.basesViewListFontSize = "xs";
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

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl?.classList.contains("tn-bases-view-list-font-xs")).toBe(true);
	});

	it("hides native toolbar while list is visible when toolbar setting is off", async () => {
		plugin.settings.basesViewListShowNativeToolbar = false;
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

		expect(setup.rootEl.classList.contains("tn-bases-native-toolbar-hidden")).toBe(true);
	});

	it("hides icons when icon display setting is off", async () => {
		plugin.settings.basesViewListShowIcons = false;
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

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl?.classList.contains("tn-bases-view-list--icons-off")).toBe(true);
		expect(setup.rootEl.querySelector(".tn-bases-view-list__item-icon")).toBeNull();
	});

	it("renders property line and joins list property values with commas", async () => {
		plugin.settings.basesViewListPropertyKey = "tags";
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", tags: ["alpha", "beta"] },
						{ name: "Cards", type: "cards", tags: "single" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const properties = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".tn-bases-view-list__item-property")
		).map((el) => el.textContent?.trim());
		expect(properties).toEqual(["alpha, beta", "single"]);
		expect(
			setup.rootEl
				.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")[0]
				.classList.contains("tn-bases-view-list__item--with-property")
		).toBe(true);
	});

	it("hides property line when setting is off or value is empty", async () => {
		plugin.settings.basesViewListShowProperty = false;
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "" },
						{ name: "Cards", type: "cards", description: "Detail" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();
		expect(setup.rootEl.querySelector(".tn-bases-view-list__item-property")).toBeNull();

		plugin.settings.basesViewListShowProperty = true;
		emitter.trigger("settings-changed");
		await flushTimersAndPromises(3);

		const itemButtons = setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item");
		expect(itemButtons[0].querySelector(".tn-bases-view-list__item-property")).toBeNull();
		expect(itemButtons[1].querySelector(".tn-bases-view-list__item-property")?.textContent?.trim()).toBe(
			"Detail"
		);
	});

	it("keeps top-list row heights uniform when property display is enabled", async () => {
		plugin.settings.basesViewListPlacement = "top";
		plugin.settings.basesViewListShowProperty = true;
		plugin.settings.basesViewListPropertyKey = "description";
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "Has value" },
						{ name: "Cards", type: "cards", description: "" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(
			setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")
		);
		expect(items).toHaveLength(2);
		expect(items.every((item) => item.classList.contains("tn-bases-view-list__item--with-property"))).toBe(
			true
		);

		const placeholders = setup.rootEl.querySelectorAll(
			".tn-bases-view-list__item-property--placeholder"
		);
		expect(placeholders).toHaveLength(1);
	});

	it("resizes view list width and persists formulas.viewListSize on pointerup", async () => {
		vaultCachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);
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

		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 260 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 320 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 320 }));
		await flushTimersAndPromises(3);

		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("320px");
		expect(vaultModify).toHaveBeenCalled();
		const modifiedText = vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string;
		const parsed = parseYaml(modifiedText) as any;
		expect(parsed.formulas.viewListSize).toBe("1.455");
		expect(typeof parsed.formulas.viewListSize).toBe("string");
	});

	it("clamps resized width to min/max bounds", async () => {
		vaultCachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);
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

		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 260 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 2000 }));
		await flushTimersAndPromises(3);
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("520px");
		{
			const parsed = parseYaml(
				vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string
			) as any;
			expect(parsed.formulas.viewListSize).toBe("2.364");
			expect(typeof parsed.formulas.viewListSize).toBe("string");
		}

		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 520 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: -2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: -2000 }));
		await flushTimersAndPromises(3);
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("140px");
		{
			const parsed = parseYaml(
				vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string
			) as any;
			expect(parsed.formulas.viewListSize).toBe("0.636");
			expect(typeof parsed.formulas.viewListSize).toBe("string");
		}
	});

	it("removes formulas.viewListSize when width is reset to default", async () => {
		vaultCachedRead.mockResolvedValue(
			"formulas:\n  viewListSize: \"1.455\"\nviews:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);
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
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("320px");

		resizerEl?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 320 }));
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 220 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 220 }));
		await flushTimersAndPromises(3);

		const modifiedText = vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string;
		expect(modifiedText).not.toContain("viewListSize");
	});

	it("auto-shrinks width when saved width is default", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "A", type: "table", description: "x" },
						{ name: "B", type: "cards", description: "y" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list-layout");
		const width = Number.parseInt(
			(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width") ?? "220px").replace("px", ""),
			10
		);
		expect(width).toBeLessThan(220);
		expect(width).toBeGreaterThanOrEqual(140);
	});

	it("does not auto-shrink width when file has saved viewListSize ratio", async () => {
		vaultCachedRead.mockResolvedValue(
			"formulas:\n  viewListSize: \"1.455\"\nviews:\n  - type: table\n    name: A\n    description: x\n  - type: cards\n    name: B\n    description: y\n"
		);
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "A", type: "table", description: "x" },
						{ name: "B", type: "cards", description: "y" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list-layout");
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("320px");
	});

	it("applies per-file formulas.viewListSize when present", async () => {
		vaultCachedRead.mockResolvedValue(
			"formulas:\n  viewListSize: \"0.8\"\nviews:\n  - type: table\n    name: Table\n  - type: cards\n    name: Cards\n"
		);
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
		expect(layoutEl?.style.getPropertyValue("--tn-bases-view-list-width")).toBe("176px");
	});

	it("opens view-list context menu with property/native-toolbar toggles and left/top items on right click", async () => {
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

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl).not.toBeNull();

		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		expect((Menu as unknown as jest.Mock)).toHaveBeenCalled();
		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		expect(menuInstance).toBeTruthy();
		expect(menuInstance.addItem).toHaveBeenCalledTimes(8);
		expect(menuInstance.addSeparator).toHaveBeenCalledTimes(3);
		expect(menuInstance.showAtMouseEvent).toHaveBeenCalled();
		expect(menuInstance.items[0]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[1]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[3]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[4]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[5]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[7]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[9]?.setTitle).toHaveBeenCalled();
		expect(menuInstance.items[10]?.setTitle).toHaveBeenCalled();
	});

	it("shows edit-description item on view-row context menu and updates YAML", async () => {
		vaultCachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n    description: Old desc\n  - type: cards\n    name: Cards\n"
		);
		(showTextInputModal as jest.Mock).mockResolvedValue("Updated desc");
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

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		expect(menuInstance.addItem).toHaveBeenCalledTimes(9);
		expect(menuInstance.addSeparator).toHaveBeenCalledTimes(4);

		const editItem = menuInstance.items[0];
		const onClickHandler = editItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(showTextInputModal).toHaveBeenCalled();
		expect(showTextInputModal).toHaveBeenCalledWith(
			plugin.app,
			expect.objectContaining({
				placeholder: "Old desc",
				initialValue: "",
				allowEmptyResult: true,
			})
		);
		expect(vaultModify).toHaveBeenCalled();
		const modifiedText = vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string;
		expect(modifiedText).toContain("description: Updated desc");
	});

	it("toggles property display from view-list context menu", async () => {
		plugin.settings.basesViewListShowProperty = true;
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "A" },
						{ name: "Cards", type: "cards", description: "B" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		const toggleItem = menuInstance.items[0];
		const onClickHandler = toggleItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListShowProperty).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(setup.rootEl.querySelector(".tn-bases-view-list__item-property")).toBeNull();
	});

	it("toggles native toolbar display from view-list context menu", async () => {
		plugin.settings.basesViewListShowNativeToolbar = true;
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "A" },
						{ name: "Cards", type: "cards", description: "B" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		const toggleItem = menuInstance.items[1];
		const onClickHandler = toggleItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListShowNativeToolbar).toBe(false);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(setup.rootEl.classList.contains("tn-bases-native-toolbar-hidden")).toBe(true);
	});

	it("changes font size from view-list context menu", async () => {
		plugin.settings.basesViewListFontSize = "m";
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "A" },
						{ name: "Cards", type: "cards", description: "B" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		const fontSmallItem = menuInstance.items[4];
		const onClickHandler = fontSmallItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListFontSize).toBe("s");
		expect(plugin.saveSettings).toHaveBeenCalled();
		const nextListEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(nextListEl?.classList.contains("tn-bases-view-list-font-s")).toBe(true);
	});

	it("redraws view list from context menu action", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "A" },
						{ name: "Cards", type: "cards", description: "B" },
					],
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemsBefore = setup.rootEl.querySelectorAll(".tn-bases-view-list__item");
		expect(itemsBefore.length).toBe(2);
		itemsBefore[0]?.remove();
		expect(setup.rootEl.querySelectorAll(".tn-bases-view-list__item").length).toBe(1);

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		const redrawItem = menuInstance.items[7];
		const onClickHandler = redrawItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelectorAll(".tn-bases-view-list__item").length).toBe(2);
	});

	it("deletes description when edit modal confirms empty value", async () => {
		vaultCachedRead.mockResolvedValue(
			"views:\n  - type: table\n    name: Table\n    description: Old desc\n  - type: cards\n    name: Cards\n"
		);
		(showTextInputModal as jest.Mock).mockResolvedValue("");
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

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuMock = Menu as unknown as jest.Mock;
		const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
		const menuInstance = lastResult?.value as any;
		const editItem = menuInstance.items[0];
		const onClickHandler = editItem?.onClick?.mock?.calls?.[0]?.[0];
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(vaultModify).toHaveBeenCalled();
		const modifiedText = vaultModify.mock.calls[vaultModify.mock.calls.length - 1][1] as string;
		expect(modifiedText).not.toContain("description: Old desc");
	});

	it("switches to top+scroll temporarily on narrow pane when behavior is top", async () => {
		plugin.settings.basesViewListPlacement = "left";
		plugin.settings.basesViewListNarrowBehavior = "top";
		plugin.settings.basesViewListNarrowThresholdPx = 1500;
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
		setLeafWidth(setup.rootEl, 900);
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".tn-bases-view-list-top-layout")).not.toBeNull();
		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl?.classList.contains("tn-bases-view-list--top-scroll")).toBe(true);
	});

	it("forces top+scroll on narrow pane even when user placement is already top", async () => {
		plugin.settings.basesViewListPlacement = "top";
		plugin.settings.basesViewListTopOverflowMode = "wrap";
		plugin.settings.basesViewListNarrowBehavior = "top";
		plugin.settings.basesViewListNarrowThresholdPx = 1500;
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
		setLeafWidth(setup.rootEl, 900);
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		const listEl = setup.rootEl.querySelector<HTMLElement>(".tn-bases-view-list");
		expect(listEl?.classList.contains("tn-bases-view-list--top")).toBe(true);
		expect(listEl?.classList.contains("tn-bases-view-list--top-scroll")).toBe(true);
		expect(listEl?.classList.contains("tn-bases-view-list--top-wrap")).toBe(false);
	});

	it("temporarily hides list on narrow pane when behavior is hide and restores when wide", async () => {
		plugin.settings.basesViewListNarrowBehavior = "hide";
		plugin.settings.basesViewListNarrowThresholdPx = 1000;
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
		setLeafWidth(setup.rootEl, 900);
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-top-layout")).toBeNull();
		expect(plugin.settings.basesViewListCollapsed).toBe(false);

		setLeafWidth(setup.rootEl, 1200);
		plugin.settings.basesViewListNarrowThresholdPx = 800;
		emitter.trigger("settings-changed");
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).not.toBeNull();
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
