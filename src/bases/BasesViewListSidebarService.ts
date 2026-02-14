import { EventRef, TFile, WorkspaceLeaf, parseYaml } from "obsidian";
import TaskNotesPlugin from "../main";

type DropdownMode = "list-only" | "combined";

interface BasesSubViewLike {
	name?: unknown;
}

interface BasesQueryLike {
	views?: BasesSubViewLike[];
}

interface BasesControllerLike {
	getQueryViewNames?: () => unknown;
	selectView?: (viewName: string) => unknown;
	query?: BasesQueryLike;
	viewName?: unknown;
}

interface BasesLeafViewLike {
	getViewType?: () => string;
	file?: TFile | null;
	controller?: BasesControllerLike;
	containerEl?: HTMLElement;
}

interface ManagedLeafState {
	rootEl: HTMLElement;
	layoutEl: HTMLElement;
	listEl: HTMLElement;
	bodyEl: HTMLElement;
	basesViewEl: HTMLElement;
}

const CSS_LAYOUT = "tn-bases-view-list-layout";
const CSS_LIST = "tn-bases-view-list";
const CSS_BODY = "tn-bases-view-list-body";
const CSS_ITEM = "tn-bases-view-list__item";
const CSS_ITEM_ACTIVE = "is-active";
const CSS_MODE_LIST_ONLY = "tn-bases-view-list-mode-list-only";
const CSS_MODE_COMBINED = "tn-bases-view-list-mode-combined";

export class BasesViewListSidebarService {
	private workspaceRefs: EventRef[] = [];
	private emitterRefs: EventRef[] = [];
	private managedLeaves = new Map<WorkspaceLeaf, ManagedLeafState>();
	private refreshTimer: number | null = null;
	private running = false;

	constructor(private plugin: TaskNotesPlugin) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.bindEvents();
		this.scheduleRefresh(50);
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		this.clearRefreshTimer();
		this.unbindEvents();
		this.cleanupAllLeaves();
	}

	private bindEvents(): void {
		this.workspaceRefs.push(
			this.plugin.app.workspace.on("active-leaf-change", () => {
				this.scheduleRefresh(50);
			})
		);

		this.workspaceRefs.push(
			this.plugin.app.workspace.on("layout-change", () => {
				this.scheduleRefresh(120);
			})
		);

		this.workspaceRefs.push(
			this.plugin.app.workspace.on("file-open", () => {
				this.scheduleRefresh(120);
			})
		);

		this.emitterRefs.push(
			this.plugin.emitter.on("settings-changed", () => {
				if (!this.running) return;
				if (!this.isFeatureEnabled()) {
					this.cleanupAllLeaves();
					return;
				}
				this.scheduleRefresh(50);
			})
		);
	}

	private unbindEvents(): void {
		const workspace = this.plugin.app.workspace as unknown as {
			offref?: (ref: EventRef) => void;
		};
		for (const ref of this.workspaceRefs) {
			workspace.offref?.(ref);
		}
		this.workspaceRefs = [];

		const emitter = this.plugin.emitter as unknown as {
			offref?: (ref: EventRef) => void;
		};
		for (const ref of this.emitterRefs) {
			emitter.offref?.(ref);
		}
		this.emitterRefs = [];
	}

	private clearRefreshTimer(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	private scheduleRefresh(delayMs: number): void {
		if (!this.running) return;
		this.clearRefreshTimer();
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refreshAll();
		}, delayMs);
	}

	private async refreshAll(): Promise<void> {
		if (!this.running) return;

		if (!this.isFeatureEnabled()) {
			this.cleanupAllLeaves();
			return;
		}

		const leaves = this.plugin.app.workspace.getLeavesOfType("bases") as WorkspaceLeaf[];
		const activeLeaves = new Set(leaves);

		for (const leaf of Array.from(this.managedLeaves.keys())) {
			if (!activeLeaves.has(leaf)) {
				this.cleanupLeaf(leaf);
			}
		}

		await Promise.all(leaves.map((leaf) => this.refreshLeaf(leaf)));
	}

	private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
		if (!this.running) return;

		if (!this.isTargetBaseLeaf(leaf)) {
			this.cleanupLeaf(leaf);
			return;
		}

		const basesViewEl = this.findBasesViewEl(leaf);
		if (!basesViewEl) {
			return;
		}

		const viewNames = await this.getViewNames(leaf);
		if (!this.running) return;
		if (viewNames.length === 0) {
			// If we cannot resolve view names, keep native Bases layout untouched.
			this.cleanupLeaf(leaf);
			return;
		}

		const state = this.ensureManagedLayout(leaf, basesViewEl);
		if (!state) return;

		this.applyDropdownModeClasses(state.rootEl);
		if (!this.managedLeaves.has(leaf)) return;

		const currentViewName = this.getCurrentViewName(leaf);
		this.renderViewList(leaf, state, viewNames, currentViewName);
	}

	private isFeatureEnabled(): boolean {
		return this.plugin.settings.enableBases && this.plugin.settings.enableBasesViewListSidebar;
	}

	private isTargetBaseLeaf(leaf: WorkspaceLeaf): boolean {
		const view = leaf.view as BasesLeafViewLike | undefined;
		if (view?.getViewType?.() !== "bases") return false;

		const file = this.getLeafFile(leaf);
		return !!file && file.extension === "base";
	}

	private getLeafView(leaf: WorkspaceLeaf): BasesLeafViewLike | null {
		return (leaf.view as BasesLeafViewLike) ?? null;
	}

	private getLeafFile(leaf: WorkspaceLeaf): TFile | null {
		const file = this.getLeafView(leaf)?.file;
		if (!file) return null;
		if (typeof file.path === "string" && typeof file.extension === "string") {
			return file;
		}
		return null;
	}

	private getController(leaf: WorkspaceLeaf): BasesControllerLike | null {
		return this.getLeafView(leaf)?.controller ?? null;
	}

	private findBasesViewEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (!containerEl) return null;

		if (containerEl.classList.contains("bases-view")) {
			return containerEl;
		}

		const nested = containerEl.querySelector<HTMLElement>(".bases-view");
		return nested ?? null;
	}

	private ensureManagedLayout(
		leaf: WorkspaceLeaf,
		basesViewEl: HTMLElement
	): ManagedLeafState | null {
		const rootEl = basesViewEl.parentElement;
		if (!rootEl) return null;

		const existing = this.managedLeaves.get(leaf);
		if (existing && existing.rootEl !== rootEl) {
			this.cleanupLeaf(leaf);
		}

		const current = this.managedLeaves.get(leaf);
		if (current) {
			if (current.basesViewEl !== basesViewEl) {
				current.bodyEl.appendChild(basesViewEl);
				current.basesViewEl = basesViewEl;
			}
			return current;
		}

		const doc = basesViewEl.ownerDocument;
		const layoutEl = doc.createElement("div");
		layoutEl.className = CSS_LAYOUT;

		const listEl = doc.createElement("nav");
		listEl.className = CSS_LIST;
		listEl.setAttribute("aria-label", this.getListLabel());

		const bodyEl = doc.createElement("div");
		bodyEl.className = CSS_BODY;

		layoutEl.appendChild(listEl);
		layoutEl.appendChild(bodyEl);
		basesViewEl.before(layoutEl);
		bodyEl.appendChild(basesViewEl);

		const state: ManagedLeafState = {
			rootEl,
			layoutEl,
			listEl,
			bodyEl,
			basesViewEl,
		};
		this.managedLeaves.set(leaf, state);
		return state;
	}

	private applyDropdownModeClasses(rootEl: HTMLElement): void {
		const mode: DropdownMode = this.plugin.settings.basesViewListDropdownMode;
		rootEl.classList.toggle(CSS_MODE_LIST_ONLY, mode === "list-only");
		rootEl.classList.toggle(CSS_MODE_COMBINED, mode === "combined");
	}

	private removeDropdownModeClasses(rootEl: HTMLElement): void {
		rootEl.classList.remove(CSS_MODE_LIST_ONLY);
		rootEl.classList.remove(CSS_MODE_COMBINED);
	}

	private cleanupAllLeaves(): void {
		for (const leaf of Array.from(this.managedLeaves.keys())) {
			this.cleanupLeaf(leaf);
		}
	}

	private cleanupLeaf(leaf: WorkspaceLeaf): void {
		const state = this.managedLeaves.get(leaf);
		if (!state) return;

		this.removeDropdownModeClasses(state.rootEl);

		if (state.layoutEl.isConnected && state.layoutEl.parentElement === state.rootEl) {
			if (state.basesViewEl.isConnected) {
				state.layoutEl.before(state.basesViewEl);
			}
			state.layoutEl.remove();
		}

		this.managedLeaves.delete(leaf);
	}

	private getListLabel(): string {
		return this.plugin.i18n.translate(
			"settings.integrations.basesIntegration.viewListSidebar.title"
		);
	}

	private renderViewList(
		leaf: WorkspaceLeaf,
		state: ManagedLeafState,
		viewNames: string[],
		currentViewName: string | null
	): void {
		const { listEl } = state;
		listEl.innerHTML = "";

		if (viewNames.length === 0) {
			return;
		}

		const doc = listEl.ownerDocument;
		const titleEl = doc.createElement("div");
		titleEl.className = "tn-bases-view-list__title";
		titleEl.textContent = this.getListLabel();
		listEl.appendChild(titleEl);

		for (const viewName of viewNames) {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = CSS_ITEM;
			button.textContent = viewName;
			button.setAttribute("data-view-name", viewName);
			button.setAttribute("aria-label", viewName);

			if (currentViewName && currentViewName === viewName) {
				button.classList.add(CSS_ITEM_ACTIVE);
			}

			button.addEventListener("click", () => {
				void this.switchView(leaf, viewName);
			});

			listEl.appendChild(button);
		}
	}

	private async switchView(leaf: WorkspaceLeaf, viewName: string): Promise<void> {
		if (!this.running) return;

		const controller = this.getController(leaf);
		const currentViewName = this.getCurrentViewName(leaf);
		if (currentViewName === viewName) return;

		if (typeof controller?.selectView === "function") {
			try {
				controller.selectView(viewName);
				this.scheduleRefresh(80);
				return;
			} catch (error) {
				console.debug("[TaskNotes][Bases] selectView failed, falling back to openLinkText", error);
			}
		}

		const file = this.getLeafFile(leaf);
		if (!file) return;

		try {
			const workspace = this.plugin.app.workspace as unknown as {
				setActiveLeaf?: (
					leaf: WorkspaceLeaf,
					params?: { focus?: boolean }
				) => void;
			};
			workspace.setActiveLeaf?.(leaf, { focus: false });
			await this.plugin.app.workspace.openLinkText(`${file.path}#${viewName}`, file.path, false);
		} catch (error) {
			console.error("[TaskNotes][Bases] Failed to switch base view", error);
		}

		this.scheduleRefresh(120);
	}

	private getCurrentViewName(leaf: WorkspaceLeaf): string | null {
		const controller = this.getController(leaf);
		if (typeof controller?.viewName === "string" && controller.viewName.trim().length > 0) {
			return controller.viewName.trim();
		}

		const containerEl = this.getLeafView(leaf)?.containerEl;
		const labelEl = containerEl?.querySelector<HTMLElement>(
			".bases-toolbar-views-menu .text-button-label"
		);
		const label = labelEl?.textContent?.trim();
		return label || null;
	}

	private async getViewNames(leaf: WorkspaceLeaf): Promise<string[]> {
		const controller = this.getController(leaf);
		const fromController = this.getViewNamesFromController(controller);
		if (fromController.length > 0) {
			return fromController;
		}

		const file = this.getLeafFile(leaf);
		if (!file) return [];

		try {
			const content = await this.plugin.app.vault.cachedRead(file);
			const parsed = parseYaml(content) as { views?: unknown } | null;
			if (!parsed || !Array.isArray(parsed.views)) {
				return [];
			}

			const names = parsed.views.map((view) => {
				if (typeof view !== "object" || view === null) return "";
				const name = (view as { name?: unknown }).name;
				return typeof name === "string" ? name : "";
			});

			return this.normalizeViewNames(names);
		} catch {
			return [];
		}
	}

	private getViewNamesFromController(controller: BasesControllerLike | null): string[] {
		if (!controller) return [];

		if (typeof controller.getQueryViewNames === "function") {
			try {
				const raw = controller.getQueryViewNames();
				if (Array.isArray(raw)) {
					return this.normalizeViewNames(
						raw.filter((item): item is string => typeof item === "string")
					);
				}
			} catch {
				// Ignore and continue fallback chain
			}
		}

		if (Array.isArray(controller.query?.views)) {
			const names = controller.query.views.map((view) =>
				typeof view?.name === "string" ? view.name : ""
			);
			return this.normalizeViewNames(names);
		}

		return [];
	}

	private normalizeViewNames(names: string[]): string[] {
		const seen = new Set<string>();
		const normalized: string[] = [];

		for (const rawName of names) {
			const name = rawName.trim();
			if (!name || seen.has(name)) continue;
			seen.add(name);
			normalized.push(name);
		}

		return normalized;
	}
}
