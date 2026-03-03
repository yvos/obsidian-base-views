import { Menu, Notice, TFile, parseYaml } from "obsidian";
import { BasesViewListSidebarService } from "../../../src/bases/BasesViewListSidebarService";
import { openNativeViewSettingsAtAnchor } from "../../../src/integrations/bases/nativeViewSettingsBridge";
import { showRgbColorInputModal } from "../../../src/modals/RgbColorInputModal";
import { showTextInputModal } from "../../../src/modals/TextInputModal";

jest.mock("../../../src/modals/TextInputModal", () => ({
	showTextInputModal: jest.fn(),
}));

jest.mock("../../../src/modals/RgbColorInputModal", () => ({
	showRgbColorInputModal: jest.fn(),
}));

jest.mock("../../../src/integrations/bases/nativeViewSettingsBridge", () => ({
	openNativeViewSettingsAtAnchor: jest.fn(),
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

const flushTimersAndPromises = async (rounds = 24): Promise<void> => {
	for (let i = 0; i < rounds; i += 1) {
		jest.runOnlyPendingTimers();
		await Promise.resolve();
	}
	for (let i = 0; i < 8; i += 1) {
		await Promise.resolve();
	}
};

function createBaseLeaf(options: {
	filePath?: string;
	currentViewName?: string;
	controller?: Record<string, unknown>;
	sidePane?: boolean;
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
	// waitForNativeToolbarLayoutReady が即座に安定判定できるよう、非ゼロ矩形を返す。
	Object.defineProperty(viewsMenuEl, "getBoundingClientRect", {
		value: () => ({
			left: 24,
			top: 16,
			width: 180,
			height: 28,
			right: 204,
			bottom: 44,
			x: 24,
			y: 16,
			toJSON: () => ({}),
		}),
	});
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

	let hostEl: HTMLElement = rootEl;
	if (options.sidePane) {
		hostEl = document.createElement("div");
		hostEl.className = "workspace-split mod-right-split";
		hostEl.appendChild(rootEl);
	}
	document.body.appendChild(hostEl);

	const file = new TFile(filePath);
	const controller = {
		viewName: currentViewName,
		...(options.controller ?? {}),
	};
	const refresh = jest.fn();

	const leaf = {
		view: {
			getViewType: () => "bases",
			file,
			controller,
			containerEl: rootEl,
			refresh,
		},
	};

	return { leaf, rootEl, headerEl, toolbarEl, labelEl, basesViewEl, controller, hostEl, refresh };
}

function setLeafWidth(rootEl: HTMLElement, width: number): void {
	Object.defineProperty(rootEl, "clientWidth", {
		value: width,
		configurable: true,
	});
}

function getLastMenuInstance(): any {
	const menuMock = Menu as unknown as jest.Mock;
	const lastResult = menuMock.mock.results[menuMock.mock.results.length - 1];
	return lastResult?.value;
}

function collectMenuItems(menu: any): any[] {
	if (!menu || !Array.isArray(menu.items)) return [];
	const collected: any[] = [];
	for (const item of menu.items) {
		collected.push(item);
		const submenu = item?.submenu;
		if (submenu && Array.isArray(submenu.items)) {
			collected.push(...collectMenuItems(submenu));
		}
	}
	return collected;
}

function getMenuItemByTitle(menu: any, expectedTitle: string): any {
	return collectMenuItems(menu).find((item: any) => {
		const title = item?.setTitle?.mock?.calls?.[0]?.[0];
		if (typeof title !== "string") return false;
		const normalized = title.replace(/^[^A-Za-z0-9(]+/, "").trim();
		return normalized === expectedTitle || title.trim() === expectedTitle;
	});
}

function createMockDataTransfer(): {
	effectAllowed: string;
	dropEffect: string;
	setData: (type: string, value: string) => void;
	getData: (type: string) => string;
} {
	const map = new Map<string, string>();
	return {
		effectAllowed: "",
		dropEffect: "",
		setData: (type: string, value: string) => {
			map.set(type, value);
		},
		getData: (type: string) => map.get(type) ?? "",
	};
}

function createDragEvent(
	type: string,
	options: {
		clientX?: number;
		clientY?: number;
		dataTransfer?: ReturnType<typeof createMockDataTransfer>;
	} = {}
): DragEvent {
	const evt = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		clientX: options.clientX ?? 0,
		clientY: options.clientY ?? 0,
	}) as DragEvent;
	Object.defineProperty(evt, "dataTransfer", {
		value: options.dataTransfer ?? createMockDataTransfer(),
	});
	return evt;
}

function triggerResizePointerDown(resizerEl: HTMLElement | null, clientX: number): void {
	if (!resizerEl) return;
	const evt = new MouseEvent("pointerdown", {
		bubbles: true,
		cancelable: true,
		clientX,
	}) as unknown as PointerEvent;
	const handler = (resizerEl as HTMLElement & { onpointerdown?: (event: PointerEvent) => void })
		.onpointerdown;
	handler?.(evt);
}

describe("BasesViewListSidebarService", () => {
	let workspace: MockWorkspace;
	let emitter: MockEventBus;
	let vault: MockEventBus;
	let plugin: any;
	let service: BasesViewListSidebarService;
	let vaultCachedRead: jest.Mock;
	let vaultModify: jest.Mock;
	let mountedRoots: HTMLElement[];

	beforeEach(() => {
		jest.useFakeTimers();
		(window as unknown as { setTimeout: typeof setTimeout }).setTimeout = setTimeout;
		(window as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = clearTimeout;
		workspace = new MockWorkspace();
		emitter = new MockEventBus();
		vault = new MockEventBus();
		vaultCachedRead = jest.fn().mockResolvedValue("");
		vaultModify = jest.fn().mockResolvedValue(undefined);
		mountedRoots = [];
		(openNativeViewSettingsAtAnchor as jest.Mock).mockReset().mockResolvedValue({
			status: "opened-settings",
		});
		(Notice as unknown as jest.Mock).mockClear();
		(Menu as unknown as jest.Mock).mockClear();

		plugin = {
			settings: {
				enableBases: true,
				enableBasesViewListSidebar: true,
				basesViewListCollapsed: false,
				basesViewListPlacement: "left",
				basesViewListSidePanePlacement: "top",
				basesViewListFontSize: "m",
				basesViewListShowProperty: true,
				basesViewListHideNativeToolbar: false,
				basesViewListShowIcons: true,
				basesViewListTopOverflowMode: "wrap",
				basesViewListNarrowBehavior: "top",
				basesViewListNarrowThresholdPx: 800,
				basesViewColorRgbHistory: [],
			},
			app: {
				workspace,
				vault: {
					cachedRead: vaultCachedRead,
					modify: vaultModify,
					on: vault.on.bind(vault),
					offref: vault.offref.bind(vault),
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
				translate: (key: string, params?: Record<string, string | number>) => {
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
						"settings.integrations.basesIntegration.viewListSidebar.itemMenuButton.ariaLabel":
							"Open view settings menu for {viewName}",
						"settings.integrations.basesIntegration.viewListSidebar.itemMenuButton.tooltip":
							"View settings: {viewName}",
							"settings.integrations.basesIntegration.viewListSidebar.notices.nativeViewSettingsOpenFailed":
								"Could not open native view settings.",
							"settings.integrations.basesIntegration.viewListSidebar.notices.nativeViewSettingsOpenPartial":
								"Could not open this view's native settings. The native view list is open.",
							"settings.integrations.basesIntegration.viewListSidebar.notices.reorderViewsFailed":
								"Failed to reorder views.",
							"settings.integrations.basesIntegration.viewListSidebar.notices.duplicateViewFailed":
								"Failed to duplicate view.",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showLeft":
							"Show on left",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showTop":
							"Show on top",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showProperty":
							"Show description",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideProperty":
							"Hide description",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showNativeToolbar":
							"Show native toolbar",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideNativeToolbar":
								"Hide native toolbar",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.editDescription":
								"Edit description",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.duplicateView":
								"Duplicate view",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorMenu":
								"Color",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.red":
								"Color: Red",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.orange":
								"Color: Orange",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.yellow":
								"Color: Yellow",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.green":
								"Color: Green",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.cyan":
								"Color: Cyan",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.blue":
								"Color: Blue",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.purple":
								"Color: Purple",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorPreset.pink":
								"Color: Pink",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorRgbInput":
								"Color: Enter RGB...",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorHistory":
								"Color: {color}",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.colorClear":
								"Color: None",
							"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeDefault":
								"Font size: Default",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeSmall":
							"Font size: Small",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeVerySmall":
							"Font size: Very Small",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.topOverflowWrap":
							"Overflow: Wrap",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.topOverflowScroll":
							"Overflow: Horizontal scroll",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.topOverflowForced":
							"Narrow pane: forced to horizontal scroll",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.persistLeft":
							"Always show on left for this base ({scope})",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.persistTop":
							"Always show on top for this base ({scope})",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.persistNone":
							"Do not show view list for this base ({scope})",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.scope.mainPane":
							"in main pane",
						"settings.integrations.basesIntegration.viewListSidebar.contextMenu.scope.sidePane":
							"in side pane",
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
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.title":
							"Set RGB color: {viewName}",
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.confirm":
							"OK",
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.cancel":
							"Cancel",
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.red":
							"R",
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.green":
							"G",
						"settings.integrations.basesIntegration.viewListSidebar.rgbColorModal.blue":
							"B",
					};
					const template = translations[key] ?? key;
					if (!params) return template;
					return template.replace(/\{(\w+)\}/g, (_, name: string) => {
						const value = params[name];
						return value == null ? `{${name}}` : String(value);
					});
				},
			},
		};

		(showTextInputModal as jest.Mock).mockResolvedValue(null);
		(showRgbColorInputModal as jest.Mock).mockResolvedValue(null);

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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(setup.rootEl.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item"));
		expect(items).toHaveLength(2);

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-icon")
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons[0]).toBe("list");
		expect(icons[1]).toBe("list");
	});

	it("falls back to generic icon when registration icon id is invalid", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Invalid", type: "invalidIconType" },
						{ name: "List", type: "list" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const icons = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-icon")
		).map((el) => el.getAttribute("data-icon"));
		expect(icons).toEqual(["list", "list"]);
	});

	it("auto-refreshes only matching base leaf on base file modify (debounced)", async () => {
		const setupA = createBaseLeaf({
			filePath: "Guides/alpha.base",
			currentViewName: "Table",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		const setupB = createBaseLeaf({
			filePath: "Guides/beta.base",
			currentViewName: "Cards",
			controller: {
				query: {
					views: [
						{ name: "Cards", type: "cards" },
						{ name: "List", type: "list" },
					],
				},
			},
		});
		mountedRoots.push(setupA.hostEl, setupB.hostEl);
		workspace.leaves = [setupA.leaf, setupB.leaf];

		service.start();
		await flushTimersAndPromises();

		(setupA.controller as any).query.views = [
			{ name: "Renamed Alpha View", type: "table" },
			{ name: "Cards", type: "cards" },
		];
		vault.trigger("modify", setupA.leaf.view.file);

		jest.advanceTimersByTime(599);
		await Promise.resolve();
		expect(
			setupA.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item-name")?.textContent?.trim()
		).toBe("Table");

		jest.advanceTimersByTime(1);
		await flushTimersAndPromises();

		expect(
			setupA.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item-name")?.textContent?.trim()
		).toBe("Renamed Alpha View");
		expect(
			setupB.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item-name")?.textContent?.trim()
		).toBe("Cards");
	});

	it("ignores non-base file modify events", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/target.base",
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const refreshLeafSpy = jest.spyOn(service as any, "refreshLeaf");
		const baselineCalls = refreshLeafSpy.mock.calls.length;

		vault.trigger("modify", new TFile("Notes/not-base.md"));
		jest.advanceTimersByTime(1000);
		await flushTimersAndPromises();

		expect(refreshLeafSpy.mock.calls.length).toBe(baselineCalls);
	});

	it("debounces repeated base modify events into a single targeted refresh", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/debounce.base",
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const refreshLeafSpy = jest.spyOn(service as any, "refreshLeaf");
		const baselineCalls = refreshLeafSpy.mock.calls.length;

		vault.trigger("modify", setup.leaf.view.file);
		jest.advanceTimersByTime(300);
		vault.trigger("modify", setup.leaf.view.file);
		jest.advanceTimersByTime(300);
		vault.trigger("modify", setup.leaf.view.file);

		jest.advanceTimersByTime(599);
		await Promise.resolve();
		expect(refreshLeafSpy.mock.calls.length).toBe(baselineCalls);

		jest.advanceTimersByTime(1);
		await flushTimersAndPromises();
		expect(refreshLeafSpy.mock.calls.length).toBe(baselineCalls + 1);
	});

	it("handles base rename by refreshing matching leaf and scheduling helper refresh", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/new-name.base",
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const refreshLeafSpy = jest.spyOn(service as any, "refreshLeaf");
		const scheduleRefreshSpy = jest.spyOn(service as any, "scheduleRefresh");
		const baselineRefreshCalls = refreshLeafSpy.mock.calls.length;
		const baselineScheduleCalls = scheduleRefreshSpy.mock.calls.length;

		vault.trigger("rename", setup.leaf.view.file, "Guides/old-name.base");

		expect(scheduleRefreshSpy.mock.calls.length).toBe(baselineScheduleCalls + 1);
		expect(scheduleRefreshSpy).toHaveBeenLastCalledWith(120);

		jest.advanceTimersByTime(600);
		await flushTimersAndPromises();
		expect(refreshLeafSpy.mock.calls.length).toBeGreaterThanOrEqual(baselineRefreshCalls + 1);
	});

	it("handles base delete by scheduling helper refresh and clearing via debounced path refresh", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/delete-target.base",
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const refreshLeafSpy = jest.spyOn(service as any, "refreshLeaf");
		const scheduleRefreshSpy = jest.spyOn(service as any, "scheduleRefresh");
		const baselineRefreshCalls = refreshLeafSpy.mock.calls.length;
		const baselineScheduleCalls = scheduleRefreshSpy.mock.calls.length;

		vault.trigger("delete", setup.leaf.view.file);

		expect(scheduleRefreshSpy.mock.calls.length).toBe(baselineScheduleCalls + 1);
		expect(scheduleRefreshSpy).toHaveBeenLastCalledWith(120);

		jest.advanceTimersByTime(600);
		await flushTimersAndPromises();
		expect(refreshLeafSpy.mock.calls.length).toBeGreaterThanOrEqual(baselineRefreshCalls + 1);
	});

	it("falls back to YAML parsing when controller views are unavailable", async () => {
		const getViewEntriesFromControllerSpy = jest
			.spyOn(service as any, "getViewEntriesFromController")
			.mockReturnValue([]);
		const getViewEntriesFromYamlFileSpy = jest
			.spyOn(service as any, "getViewEntriesFromYamlFile")
			.mockResolvedValue([
				{
					name: "Table",
					type: "table",
					icon: "table",
					propertyText: "Alpha",
					descriptionText: "Alpha",
				},
				{
					name: "Cards",
					type: "cards",
					icon: "layout-grid",
					propertyText: "Beta",
					descriptionText: "Beta",
				},
			]);
		const setup = createBaseLeaf({
			controller: {
				query: {},
				getQueryViewNames: () => [],
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		vaultCachedRead.mockResolvedValue(
			`views:\n  - type: table\n    name: Table\n    description: Alpha\n  - type: cards\n    name: Cards\n    description: Beta`
		);

		service.start();
		await flushTimersAndPromises();

		const names = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-name")
		).map((el) => el.textContent?.trim());
		expect(names).toEqual(["Table", "Cards"]);

		const props = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-property")
		).map((el) => el.textContent?.trim());
		expect(props).toEqual(["Alpha", "Beta"]);
		expect(getViewEntriesFromControllerSpy).toHaveBeenCalled();
		expect(getViewEntriesFromYamlFileSpy).toHaveBeenCalledWith(setup.leaf.view.file);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item")[1];
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item")[1];
		targetButton.click();
		await flushTimersAndPromises();

		expect(workspace.setActiveLeaf).toHaveBeenCalledWith(setup.leaf, { focus: false });
		expect(workspace.openLinkText).toHaveBeenCalledWith(
			"Guides/test.base#custom view",
			"Guides/test.base",
			false
		);
	});

	it("toggles view list off for active base leaf when currently visible", async () => {
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).not.toBeNull();

		const changed = await service.toggleViewListForActiveBaseLeaf();
		await flushTimersAndPromises(3);

		expect(changed).toBe(true);
		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-open-trigger")).not.toBeNull();
	});

	it("toggles view list on for active base leaf when placement is none", async () => {
		plugin.settings.basesViewListPlacement = "none";
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();

		const changed = await service.toggleViewListForActiveBaseLeaf();
		await flushTimersAndPromises(3);

		expect(changed).toBe(true);
		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).not.toBeNull();
	});

	it("does nothing when toggling active base view list with only one view", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		const changed = await service.toggleViewListForActiveBaseLeaf();
		await flushTimersAndPromises();

		expect(changed).toBe(false);
		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-open-trigger")).toBeNull();
	});

	it("opens next view for active base leaf", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			currentViewName: "Table",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
						{ name: "List", type: "list" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		const changed = await service.openNextViewForActiveBaseLeaf();

		expect(changed).toBe(true);
		expect(selectView).toHaveBeenCalledWith("Cards");
	});

	it("loops to first view when opening next from last view", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			currentViewName: "List",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
						{ name: "List", type: "list" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		const changed = await service.openNextViewForActiveBaseLeaf();

		expect(changed).toBe(true);
		expect(selectView).toHaveBeenCalledWith("Table");
	});

	it("loops to last view when opening previous from first view", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			currentViewName: "Table",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
						{ name: "List", type: "list" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		const changed = await service.openPreviousViewForActiveBaseLeaf();

		expect(changed).toBe(true);
		expect(selectView).toHaveBeenCalledWith("List");
	});

	it("does nothing for next/previous commands when active leaf is not a base file", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			filePath: "Guides/test.md",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		service.start();
		await flushTimersAndPromises();

		const nextChanged = await service.openNextViewForActiveBaseLeaf();
		const prevChanged = await service.openPreviousViewForActiveBaseLeaf();

		expect(nextChanged).toBe(false);
		expect(prevChanged).toBe(false);
		expect(selectView).not.toHaveBeenCalled();
	});

	it("opens next view even when service is not started", async () => {
		plugin.settings.enableBasesViewListSidebar = false;
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			currentViewName: "Table",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
				selectView,
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];
		(workspace as any).activeLeaf = setup.leaf;

		const changed = await service.openNextViewForActiveBaseLeaf();

		expect(changed).toBe(true);
		expect(selectView).toHaveBeenCalledWith("Cards");
	});

	it("renders per-view item menu button", async () => {
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemButtons = setup.rootEl.querySelectorAll(".bv-bases-view-list__item");
		const itemMenuButtons = setup.rootEl.querySelectorAll(".bv-bases-view-list__item-menu");
		expect(itemButtons).toHaveLength(2);
		expect(itemMenuButtons).toHaveLength(2);
	});

	it("opens native settings from item menu button without switching views", async () => {
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemMenuButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(
			".bv-bases-view-list__item-menu"
		)[1];
		itemMenuButton.click();
		await flushTimersAndPromises();

		expect(openNativeViewSettingsAtAnchor).toHaveBeenCalledWith(
			expect.objectContaining({
				rootEl: setup.rootEl,
				viewName: "custom view",
				anchorEl: itemMenuButton,
				nativeToolbarHiddenClass: "bv-bases-native-toolbar-hidden",
			})
		);
		expect(selectView).not.toHaveBeenCalled();
		expect(workspace.openLinkText).not.toHaveBeenCalled();
		expect(Notice).not.toHaveBeenCalled();
	});

	it("shows notice only when native settings open is partial", async () => {
		(openNativeViewSettingsAtAnchor as jest.Mock).mockResolvedValueOnce({
			status: "opened-view-list-only",
			reason: "view-settings-not-opened",
		});
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemMenuButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list__item-menu"
		);
		itemMenuButton?.click();
		await flushTimersAndPromises();

		expect(Notice).toHaveBeenCalledWith(
			"Could not open this view's native settings. The native view list is open."
		);
		expect(Menu).not.toHaveBeenCalled();
	});

	it("shows failed notice only when native settings open fails", async () => {
		(openNativeViewSettingsAtAnchor as jest.Mock).mockResolvedValueOnce({
			status: "failed",
			reason: "views-trigger-missing",
		});
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemMenuButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list__item-menu"
		);
		itemMenuButton?.click();
		await flushTimersAndPromises();

		expect(Notice).toHaveBeenCalledWith(
			"Could not open native view settings."
		);
		expect(Menu).not.toHaveBeenCalled();
	});

	it("opens native settings from item menu button on Enter key", async () => {
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemMenuButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list__item-menu"
		);
		itemMenuButton?.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				bubbles: true,
				cancelable: true,
			})
		);
		await flushTimersAndPromises();

		expect(openNativeViewSettingsAtAnchor).toHaveBeenCalledTimes(1);
	});

	it("opens native settings from item menu button on Space key", async () => {
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemMenuButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list__item-menu"
		);
		itemMenuButton?.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: " ",
				bubbles: true,
				cancelable: true,
			})
		);
		await flushTimersAndPromises();

		expect(openNativeViewSettingsAtAnchor).toHaveBeenCalledTimes(1);
	});

	it("hides sidebar and toolbar trigger when only one view exists", async () => {
		plugin.settings.basesViewListHideNativeToolbar = true;
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [{ name: "Table", type: "table" }],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-top-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-open-trigger")).toBeNull();
		expect(setup.rootEl.classList.contains("bv-bases-native-toolbar-hidden")).toBe(false);
	});

	it("shows toolbar open trigger when placement is none and opens list on click", async () => {
		plugin.settings.basesViewListPlacement = "none";
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		const triggerButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list-open-trigger button"
		);
		expect(triggerButton).not.toBeNull();

		triggerButton?.click();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).not.toBeNull();
	});

	it("opens top layout from trigger when side pane placement is none", async () => {
		plugin.settings.basesViewListHideNativeToolbar = true;
		plugin.settings.basesViewListPlacement = "left";
		plugin.settings.basesViewListSidePanePlacement = "none";
		const setup = createBaseLeaf({
			sidePane: true,
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.classList.contains("bv-bases-native-toolbar-hidden")).toBe(false);
		expect(setup.rootEl.querySelector(".bv-bases-view-list-open-trigger")).not.toBeNull();

		const triggerButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list-open-trigger button"
		);
		triggerButton?.click();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-top-layout")).not.toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
	});

	it("returns to none state after closing list opened from trigger", async () => {
		plugin.settings.basesViewListPlacement = "none";
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const triggerButton = setup.rootEl.querySelector<HTMLButtonElement>(
			".bv-bases-view-list-open-trigger button"
		);
		triggerButton?.click();
		await flushTimersAndPromises(3);
		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).not.toBeNull();

		const closeButton = setup.rootEl.querySelector<HTMLButtonElement>(".bv-bases-view-list__close");
		closeButton?.click();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-open-trigger")).not.toBeNull();
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const titleEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__title");
		expect(titleEl?.textContent?.trim()).toBe("Base-all");

		const closeButton = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__close");
		expect(closeButton?.classList.contains("bv-bases-view-list__close--small")).toBe(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const topLayout = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-top-layout");
		expect(topLayout).not.toBeNull();
		expect(setup.headerEl.nextElementSibling).toBe(topLayout);
		expect(topLayout?.querySelector(".bv-bases-view-list__title")).toBeNull();
		expect(topLayout?.querySelector(".bv-bases-view-list__close")).not.toBeNull();
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list--top")).toBe(true);
		expect(listEl?.classList.contains("bv-bases-view-list--top-scroll")).toBe(true);
		expect(listEl?.classList.contains("bv-bases-view-list--top-wrap")).toBe(false);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list-font-xs")).toBe(true);
	});

	it("hides native toolbar while list is visible when hide-toolbar setting is on", async () => {
		plugin.settings.basesViewListHideNativeToolbar = true;
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.classList.contains("bv-bases-native-toolbar-hidden")).toBe(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list--icons-off")).toBe(true);
		expect(setup.rootEl.querySelector(".bv-bases-view-list__item-icon")).toBeNull();
	});

	it("renders description line from view description", async () => {
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "Alpha, beta" },
						{ name: "Cards", type: "cards", description: "Single" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const properties = Array.from(
			setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-property")
		).map((el) => el.textContent?.trim());
		expect(properties).toEqual(["Alpha, beta", "Single"]);
		expect(
			setup.rootEl
				.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item")[0]
				.classList.contains("bv-bases-view-list__item--with-property")
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();
		expect(setup.rootEl.querySelector(".bv-bases-view-list__item-property")).toBeNull();

		plugin.settings.basesViewListShowProperty = true;
		emitter.trigger("settings-changed");
		await flushTimersAndPromises(3);

		const itemButtons = setup.rootEl.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item");
		expect(itemButtons[0].querySelector(".bv-bases-view-list__item-property")).toBeNull();
		expect(itemButtons[1].querySelector(".bv-bases-view-list__item-property")?.textContent?.trim()).toBe(
			"Detail"
		);
	});

	it("keeps top-list row heights uniform when property display is enabled", async () => {
		plugin.settings.basesViewListPlacement = "top";
		plugin.settings.basesViewListShowProperty = true;
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(
			setup.rootEl.querySelectorAll<HTMLButtonElement>(".bv-bases-view-list__item")
		);
		expect(items).toHaveLength(2);
		expect(items.every((item) => item.classList.contains("bv-bases-view-list__item--with-property"))).toBe(
			true
		);

		const placeholders = setup.rootEl.querySelectorAll(
			".bv-bases-view-list__item-property--placeholder"
		);
		expect(placeholders).toHaveLength(1);
	});

	it("resizes view list width and persists formulas.viewListSize on pointerup", async () => {
		const persistWidthForLeafSpy = jest
			.spyOn(service as any, "persistWidthForLeaf")
			.mockResolvedValue(undefined);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-layout");
		const resizerEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__resizer");
		expect(layoutEl).not.toBeNull();
		expect(resizerEl).not.toBeNull();

		triggerResizePointerDown(resizerEl, 140);
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 320 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 320 }));
		await flushTimersAndPromises(3);

		expect(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width")).toBe("320px");
		expect(persistWidthForLeafSpy).toHaveBeenCalledWith(setup.leaf, 320);
	});

	it("clamps resized width to min/max bounds", async () => {
		const persistWidthForLeafSpy = jest
			.spyOn(service as any, "persistWidthForLeaf")
			.mockResolvedValue(undefined);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-layout");
		const resizerEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__resizer");
		expect(layoutEl).not.toBeNull();
		expect(resizerEl).not.toBeNull();

		triggerResizePointerDown(resizerEl, 140);
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 2000 }));
		await flushTimersAndPromises(3);
		expect(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width")).toBe("520px");
		expect(persistWidthForLeafSpy).toHaveBeenLastCalledWith(setup.leaf, 520);

		triggerResizePointerDown(resizerEl, 520);
		window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: -2000 }));
		window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: -2000 }));
		await flushTimersAndPromises(3);
		expect(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width")).toBe("140px");
		expect(persistWidthForLeafSpy).toHaveBeenLastCalledWith(setup.leaf, 140);
	});

	it("removes formulas.viewListSize when width is reset to default", async () => {
		const setViewListSizeRatioSpy = jest
			.spyOn((service as any).yamlStore, "setViewListSizeRatio")
			.mockResolvedValue(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();
		await (service as any).persistWidthForLeaf(setup.leaf, 220);
		expect(setViewListSizeRatioSpy).toHaveBeenCalledWith(setup.leaf.view.file, null);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-layout");
		const width = Number.parseInt(
			(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width") ?? "220px").replace("px", ""),
			10
		);
		expect(width).toBeLessThan(220);
		expect(width).toBeGreaterThanOrEqual(140);
	});

	it("does not auto-shrink width when file has saved viewListSize ratio", async () => {
		jest.spyOn(service as any, "getPreferredWidth").mockResolvedValue({
			widthPx: 320,
			source: "file",
		});
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-layout");
		expect(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width")).toBe("320px");
	});

	it("applies per-file formulas.viewListSize when present", async () => {
		jest.spyOn(service as any, "getPreferredWidth").mockResolvedValue({
			widthPx: 176,
			source: "file",
		});
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const layoutEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list-layout");
		expect(layoutEl?.style.getPropertyValue("--bv-bases-view-list-width")).toBe("176px");
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl).not.toBeNull();

		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		expect((Menu as unknown as jest.Mock)).toHaveBeenCalledTimes(1);
		const menuInstance = getLastMenuInstance();
		expect(menuInstance).toBeTruthy();
		expect(menuInstance.showAtMouseEvent).toHaveBeenCalled();
		expect(getMenuItemByTitle(menuInstance, "Hide description")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Hide native toolbar")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Font size: Default")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Redraw view list")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Show on left")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Show on top")).toBeTruthy();
		expect(getMenuItemByTitle(menuInstance, "Do not show view list for this base (in main pane)")).toBeTruthy();
	});

	it("shows edit-description item on view-row context menu and updates YAML", async () => {
		const updateViewDescriptionSpy = jest
			.spyOn((service as any).yamlStore, "updateViewDescription")
			.mockResolvedValue(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const editItem = getMenuItemByTitle(menuInstance, "Edit description");
		const onClickHandler = editItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(showTextInputModal).toHaveBeenCalled();
		expect(showTextInputModal).toHaveBeenCalledWith(
			plugin.app,
			expect.objectContaining({
				title: "Edit description: Table",
				placeholder: "Old desc",
				initialValue: "",
				confirmText: "Save",
				cancelText: "Cancel",
				allowEmptyResult: true,
			})
		);
		expect(updateViewDescriptionSpy).toHaveBeenCalledWith(
			setup.leaf.view.file,
			"Table",
			"Updated desc"
		);
	});

	it("duplicates view from row context menu and redraws list", async () => {
		const duplicateViewSpy = jest
			.spyOn((service as any).yamlStore, "duplicateView")
			.mockResolvedValue("Table_2");
		const redrawViewListSpy = jest
			.spyOn(service as any, "redrawViewList")
			.mockResolvedValue(undefined);
		vaultCachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"    description: Main",
				"  - type: cards",
				"    name: Cards",
			].join("\n")
		);
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", description: "Main" },
						{ name: "Cards", type: "cards", description: "Cards desc" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const duplicateItem = getMenuItemByTitle(menuInstance, "Duplicate view");
		const onClickHandler = duplicateItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(duplicateViewSpy).toHaveBeenCalledWith(setup.leaf.view.file, "Table");
		expect(redrawViewListSpy).toHaveBeenCalledWith(setup.leaf);
	});

	it("updates view bg-color with preset from row context menu", async () => {
		const updateViewBgColorSpy = jest
			.spyOn((service as any).yamlStore, "updateViewBgColor")
			.mockResolvedValue(true);
		const redrawViewListSpy = jest
			.spyOn(service as any, "redrawViewList")
			.mockResolvedValue(undefined);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const topLevelItems = menuInstance.items.filter((item: any) => item?.type !== "separator");
		const lastTopLevelItem = topLevelItems[topLevelItems.length - 1];
		const lastTopLevelTitle = lastTopLevelItem?.setTitle?.mock?.calls?.[0]?.[0];
		expect(lastTopLevelTitle).toBe("Color");
		expect(getMenuItemByTitle(menuInstance, "Color")).toBeTruthy();
		const colorItem = getMenuItemByTitle(menuInstance, "Color: Red");
		const onClickHandler = colorItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(updateViewBgColorSpy).toHaveBeenCalledWith(setup.leaf.view.file, "Table", "red");
		expect(redrawViewListSpy).toHaveBeenCalledWith(setup.leaf);
	});

	it("updates view bg-color from RGB modal and remembers global history", async () => {
		const updateViewBgColorSpy = jest
			.spyOn((service as any).yamlStore, "updateViewBgColor")
			.mockResolvedValue(true);
		const redrawViewListSpy = jest
			.spyOn(service as any, "redrawViewList")
			.mockResolvedValue(undefined);
		(showRgbColorInputModal as jest.Mock).mockResolvedValue("rgb(1,2,3)");
		const baselineSaveCalls = plugin.saveSettings.mock.calls.length;

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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const rgbItem = getMenuItemByTitle(menuInstance, "Color: Enter RGB...");
		const onClickHandler = rgbItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(showRgbColorInputModal).toHaveBeenCalledWith(
			plugin.app,
			expect.objectContaining({
				title: "Set RGB color: Table",
				confirmText: "OK",
				cancelText: "Cancel",
				redLabel: "R",
				greenLabel: "G",
				blueLabel: "B",
				initialValue: null,
			})
		);
		expect(updateViewBgColorSpy).toHaveBeenCalledWith(
			setup.leaf.view.file,
			"Table",
			"rgb(1,2,3)"
		);
		expect(redrawViewListSpy).toHaveBeenCalledWith(setup.leaf);
		expect(plugin.settings.basesViewColorRgbHistory).toEqual(["rgb(1,2,3)"]);
		expect(plugin.saveSettings.mock.calls.length).toBeGreaterThan(baselineSaveCalls);
	});

	it("applies per-view row colors and active-list background color from bg-color", async () => {
		const setup = createBaseLeaf({
			currentViewName: "Table",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table", "bg-color": "red" },
						{ name: "Cards", type: "cards", "bg-color": "rgb(12,34,56)" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const tableRow = setup.rootEl.querySelector<HTMLElement>(
			'.bv-bases-view-list__item-row[data-view-name="Table"]'
		);
		const cardsRow = setup.rootEl.querySelector<HTMLElement>(
			'.bv-bases-view-list__item-row[data-view-name="Cards"]'
		);
		expect(tableRow).not.toBeNull();
		expect(cardsRow).not.toBeNull();
		expect(tableRow?.classList.contains("is-active")).toBe(true);
		expect(tableRow?.classList.contains("bv-bases-view-list__item-row--view-color")).toBe(false);
		expect(cardsRow?.classList.contains("bv-bases-view-list__item-row--view-color")).toBe(true);

		const cardsButton = cardsRow?.querySelector<HTMLElement>(".bv-bases-view-list__item");
		const cardsBg = cardsButton?.style.getPropertyValue("--bv-view-row-bg") ?? "";
		const cardsFg = cardsButton?.style.getPropertyValue("--bv-view-row-fg") ?? "";
		expect(cardsBg).toContain("rgb(");
		expect(cardsFg).toContain("rgb(");

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list--active-color")).toBe(true);
		expect(listEl?.style.getPropertyValue("--bv-active-view-list-bg") ?? "").toContain("rgb(");
	});

	it("reorders views by drag and redraws list", async () => {
		const reorderViewsSpy = jest
			.spyOn((service as any).yamlStore, "reorderViews")
			.mockResolvedValue(true);
		const redrawViewListSpy = jest
			.spyOn(service as any, "redrawViewList")
			.mockResolvedValue(undefined);
		vaultCachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"  - type: cards",
				"    name: Cards",
				"  - type: list",
				"    name: List",
			].join("\n")
		);
		const setup = createBaseLeaf({
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
						{ name: "List", type: "list" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const rowEls = setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-row");
		expect(rowEls.length).toBe(3);
		const sourceRow = rowEls[0];
		const targetRow = rowEls[1];
		const sourceButton = sourceRow.querySelector<HTMLButtonElement>(".bv-bases-view-list__item");
		expect(sourceButton).not.toBeNull();

		sourceButton?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		const dataTransfer = createMockDataTransfer();
		sourceRow.dispatchEvent(createDragEvent("dragstart", { dataTransfer }));
		targetRow.dispatchEvent(createDragEvent("dragover", { clientY: 999, dataTransfer }));
		targetRow.dispatchEvent(createDragEvent("drop", { clientY: 999, dataTransfer }));
		sourceRow.dispatchEvent(createDragEvent("dragend", { dataTransfer }));
		await flushTimersAndPromises(3);

		expect(reorderViewsSpy).toHaveBeenCalledWith(setup.leaf.view.file, ["Cards", "Table", "List"]);
		expect(redrawViewListSpy).toHaveBeenCalledWith(setup.leaf);
	});

	it("does not start drag reorder from the 3-dot menu button", async () => {
		vaultCachedRead.mockResolvedValue(
			[
				"views:",
				"  - type: table",
				"    name: Table",
				"  - type: cards",
				"    name: Cards",
			].join("\n")
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const rowEls = setup.rootEl.querySelectorAll<HTMLElement>(".bv-bases-view-list__item-row");
		expect(rowEls.length).toBe(2);
		const sourceRow = rowEls[0];
		const targetRow = rowEls[1];
		const menuButton = sourceRow.querySelector<HTMLButtonElement>(".bv-bases-view-list__item-menu");
		expect(menuButton).not.toBeNull();

		menuButton?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		const dataTransfer = createMockDataTransfer();
		sourceRow.dispatchEvent(createDragEvent("dragstart", { dataTransfer }));
		targetRow.dispatchEvent(createDragEvent("dragover", { clientY: 999, dataTransfer }));
		targetRow.dispatchEvent(createDragEvent("drop", { clientY: 999, dataTransfer }));
		sourceRow.dispatchEvent(createDragEvent("dragend", { dataTransfer }));
		await flushTimersAndPromises(3);

		expect(vaultModify).not.toHaveBeenCalled();
	});

	it("toggles property display from view-list context menu", async () => {
		const setViewListShowPropertySpy = jest
			.spyOn((service as any).yamlStore, "setViewListShowProperty")
			.mockResolvedValue(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const toggleItem = getMenuItemByTitle(menuInstance, "Hide description");
		const onClickHandler = toggleItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListShowProperty).toBe(true);
		expect(setViewListShowPropertySpy).toHaveBeenCalledWith(setup.leaf.view.file, false);
	});

	it("stores persistent none placement per base from context menu", async () => {
		const setViewListPositionSpy = jest
			.spyOn((service as any).yamlStore, "setViewListPosition")
			.mockResolvedValue(true);
		const setup = createBaseLeaf({
			filePath: "Guides/persist-none.base",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const persistNoneItem = getMenuItemByTitle(
			menuInstance,
			"Do not show view list for this base (in main pane)"
		);
		const onClickHandler = persistNoneItem?.onClick?.mock?.calls?.[0]?.[0];
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(setViewListPositionSpy).toHaveBeenCalledWith(setup.leaf.view.file, "normal", "none");
	});

	it("applies temporary top placement without persisting formulas", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/temp-top.base",
			controller: {
				query: {
					views: [
						{ name: "Table", type: "table" },
						{ name: "Cards", type: "cards" },
					],
				},
			},
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const topItem = getMenuItemByTitle(menuInstance, "Show on top");
		const onClickHandler = topItem?.onClick?.mock?.calls?.[0]?.[0];
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-top-layout")).not.toBeNull();
		expect(vaultModify).not.toHaveBeenCalled();
	});

	it("toggles native toolbar display from view-list context menu", async () => {
		plugin.settings.basesViewListHideNativeToolbar = false;
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const toggleItem = getMenuItemByTitle(menuInstance, "Hide native toolbar");
		const onClickHandler = toggleItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListHideNativeToolbar).toBe(true);
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(setup.rootEl.classList.contains("bv-bases-native-toolbar-hidden")).toBe(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const fontSmallItem = getMenuItemByTitle(menuInstance, "Font size: Small");
		const onClickHandler = fontSmallItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(plugin.settings.basesViewListFontSize).toBe("s");
		expect(plugin.saveSettings).toHaveBeenCalled();
		const nextListEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(nextListEl?.classList.contains("bv-bases-view-list-font-s")).toBe(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemsBefore = setup.rootEl.querySelectorAll(".bv-bases-view-list__item");
		expect(itemsBefore.length).toBe(2);
		itemsBefore[0]?.remove();
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list__item").length).toBe(1);

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const redrawItem = getMenuItemByTitle(menuInstance, "Redraw view list");
		const onClickHandler = redrawItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(setup.refresh).toHaveBeenCalledTimes(1);
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list__item").length).toBe(2);
	});

	it("continues redrawing view list even when base refresh throws", async () => {
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
		setup.refresh.mockImplementation(() => {
			throw new Error("refresh failed");
		});
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const itemsBefore = setup.rootEl.querySelectorAll(".bv-bases-view-list__item");
		expect(itemsBefore.length).toBe(2);
		itemsBefore[0]?.remove();
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list__item").length).toBe(1);

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		listEl?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const redrawItem = getMenuItemByTitle(menuInstance, "Redraw view list");
		const onClickHandler = redrawItem?.onClick?.mock?.calls?.[0]?.[0];
		expect(typeof onClickHandler).toBe("function");

		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(setup.refresh).toHaveBeenCalledTimes(1);
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list__item").length).toBe(2);
	});

	it("deletes description when edit modal confirms empty value", async () => {
		const updateViewDescriptionSpy = jest
			.spyOn((service as any).yamlStore, "updateViewDescription")
			.mockResolvedValue(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const firstItem = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list__item");
		firstItem?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await flushTimersAndPromises();

		const menuInstance = getLastMenuInstance();
		const editItem = getMenuItemByTitle(menuInstance, "Edit description");
		const onClickHandler = editItem?.onClick?.mock?.calls?.[0]?.[0];
		await onClickHandler();
		await flushTimersAndPromises(3);

		expect(updateViewDescriptionSpy).toHaveBeenCalledWith(setup.leaf.view.file, "Table", null);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-top-layout")).not.toBeNull();
		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list--top-scroll")).toBe(true);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		const listEl = setup.rootEl.querySelector<HTMLElement>(".bv-bases-view-list");
		expect(listEl?.classList.contains("bv-bases-view-list--top")).toBe(true);
		expect(listEl?.classList.contains("bv-bases-view-list--top-scroll")).toBe(true);
		expect(listEl?.classList.contains("bv-bases-view-list--top-wrap")).toBe(false);
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).toBeNull();
		expect(setup.rootEl.querySelector(".bv-bases-view-list-top-layout")).toBeNull();

		setLeafWidth(setup.rootEl, 1200);
		plugin.settings.basesViewListNarrowThresholdPx = 800;
		emitter.trigger("settings-changed");
		await flushTimersAndPromises(3);

		expect(setup.rootEl.querySelector(".bv-bases-view-list-layout")).not.toBeNull();
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
		mountedRoots.push(setup.hostEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		for (let i = 0; i < 4; i += 1) {
			emitter.trigger("settings-changed");
			await flushTimersAndPromises();
		}

		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list-layout")).toHaveLength(1);
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list-open-trigger")).toHaveLength(0);
		expect(setup.rootEl.querySelectorAll(".bv-bases-view-list__resizer")).toHaveLength(1);
	});
});

