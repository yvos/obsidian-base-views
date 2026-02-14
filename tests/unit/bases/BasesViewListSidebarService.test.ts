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

const flushTimersAndPromises = async (): Promise<void> => {
	jest.runOnlyPendingTimers();
	await Promise.resolve();
	await Promise.resolve();
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

	return { leaf, rootEl, labelEl, basesViewEl, controller };
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
			},
			app: {
				workspace,
				vault: {
					cachedRead: vaultCachedRead,
				},
			},
			emitter,
			i18n: {
				translate: (key: string) => {
					if (key === "settings.integrations.basesIntegration.viewListSidebar.title") {
						return "Views";
					}
					return key;
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

	it("renders view names from internal controller API", async () => {
		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => ["Table", "custom view", "ビュー"],
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(
			setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")
		);
		expect(items.map((item) => item.textContent?.trim())).toEqual([
			"Table",
			"custom view",
			"ビュー",
		]);
		expect(items[0].classList.contains("is-active")).toBe(true);
		expect(setup.rootEl.classList.contains("tn-bases-view-list-mode-list-only")).toBe(true);
	});

	it("falls back to parsing .base YAML when controller names are unavailable", async () => {
		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => [],
				query: {},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		vaultCachedRead.mockResolvedValue(`views:\n  - type: table\n    name: Table\n  - type: tasknotesCustomTable\n    name: custom view`);

		service.start();
		await flushTimersAndPromises();

		const items = Array.from(
			setup.rootEl.querySelectorAll<HTMLButtonElement>(".tn-bases-view-list__item")
		);
		expect(items.map((item) => item.textContent?.trim())).toEqual(["Table", "custom view"]);
	});

	it("switches view via selectView when available", async () => {
		const selectView = jest.fn();
		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => ["Table", "custom view"],
				selectView,
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(
			".tn-bases-view-list__item"
		)[1];
		targetButton.click();
		await flushTimersAndPromises();

		expect(selectView).toHaveBeenCalledWith("custom view");
		expect(workspace.openLinkText).not.toHaveBeenCalled();
	});

	it("falls back to openLinkText when selectView fails", async () => {
		const setup = createBaseLeaf({
			filePath: "Guides/test.base",
			controller: {
				getQueryViewNames: () => ["Table", "custom view"],
				selectView: () => {
					throw new Error("internal API unavailable");
				},
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		const targetButton = setup.rootEl.querySelectorAll<HTMLButtonElement>(
			".tn-bases-view-list__item"
		)[1];
		targetButton.click();
		await flushTimersAndPromises();

		expect(workspace.setActiveLeaf).toHaveBeenCalledWith(setup.leaf, { focus: false });
		expect(workspace.openLinkText).toHaveBeenCalledWith(
			"Guides/test.base#custom view",
			"Guides/test.base",
			false
		);
	});

	it("does nothing when sidebar setting is disabled", async () => {
		plugin.settings.enableBasesViewListSidebar = false;

		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => ["Table", "custom view"],
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
	});

	it("updates dropdown mode classes and removes DOM when disabled at runtime", async () => {
		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => ["Table", "custom view"],
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();
		expect(setup.rootEl.classList.contains("tn-bases-view-list-mode-list-only")).toBe(true);

		plugin.settings.basesViewListDropdownMode = "combined";
		emitter.trigger("settings-changed");
		await flushTimersAndPromises();

		expect(setup.rootEl.classList.contains("tn-bases-view-list-mode-list-only")).toBe(false);
		expect(setup.rootEl.classList.contains("tn-bases-view-list-mode-combined")).toBe(true);

		plugin.settings.enableBasesViewListSidebar = false;
		emitter.trigger("settings-changed");
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		expect(setup.basesViewEl.parentElement).toBe(setup.rootEl);
	});

	it("keeps native layout when view names cannot be resolved", async () => {
		const setup = createBaseLeaf({
			controller: {
				getQueryViewNames: () => ["Table"],
			},
		});
		mountedRoots.push(setup.rootEl);
		workspace.leaves = [setup.leaf];

		service.start();
		await flushTimersAndPromises();
		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).not.toBeNull();

		(setup.controller as any).getQueryViewNames = () => [];
		vaultCachedRead.mockResolvedValue("views: []");
		emitter.trigger("settings-changed");
		await flushTimersAndPromises();

		expect(setup.rootEl.querySelector(".tn-bases-view-list-layout")).toBeNull();
		expect(setup.basesViewEl.parentElement).toBe(setup.rootEl);
	});
});
