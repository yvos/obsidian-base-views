import { EventRef, TFile, WorkspaceLeaf, parseYaml, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";

type DropdownMode = "list-only" | "combined";

interface BasesSubViewLike {
	name?: unknown;
	type?: unknown;
}

interface BasesQueryLike {
	views?: BasesSubViewLike[];
}

interface BasesControllerLike {
	getQueryViewNames?: () => unknown;
	selectView?: (viewName: string) => unknown;
	query?: BasesQueryLike | null;
	viewName?: unknown;
}

interface BasesLeafViewLike {
	getViewType?: () => string;
	file?: TFile | null;
	controller?: BasesControllerLike;
	containerEl?: HTMLElement;
}

interface ViewEntry {
	name: string;
	type: string | null;
	icon: string;
}

interface ManagedLeafState {
	rootEl: HTMLElement;
	layoutEl: HTMLElement;
	listEl: HTMLElement;
	bodyEl: HTMLElement;
	resizerEl: HTMLElement;
	basesViewEl: HTMLElement;
}

interface BasesRegistrationLike {
	icon?: unknown;
}

type BasesRegistrationMap = Record<string, BasesRegistrationLike | undefined>;

interface ResizeDragState {
	leaf: WorkspaceLeaf;
	layoutEl: HTMLElement;
	startX: number;
	startWidth: number;
	lastWidth: number;
}

const CSS_LAYOUT = "tn-bases-view-list-layout";
const CSS_LIST = "tn-bases-view-list";
const CSS_BODY = "tn-bases-view-list-body";
const CSS_ITEM = "tn-bases-view-list__item";
const CSS_ITEM_ACTIVE = "is-active";
const CSS_ITEM_ICON = "tn-bases-view-list__item-icon";
const CSS_HEADER = "tn-bases-view-list__header";
const CSS_TITLE = "tn-bases-view-list__title";
const CSS_CLOSE = "tn-bases-view-list__close";
const CSS_RESIZER = "tn-bases-view-list__resizer";
const CSS_OPEN_TRIGGER = "tn-bases-view-list-open-trigger";
const CSS_MODE_LIST_ONLY = "tn-bases-view-list-mode-list-only";
const CSS_MODE_COMBINED = "tn-bases-view-list-mode-combined";

const WIDTH_MIN = 140;
const WIDTH_MAX = 520;
const WIDTH_DEFAULT = 220;

const KNOWN_VIEW_ICONS: Record<string, string> = {
	table: "table",
	cards: "layout-grid",
	list: "list",
	tasknotesCustomTable: "table",
	tasknotesTaskList: "list",
	tasknotesKanban: "layout-columns",
	tasknotesCalendar: "calendar",
	tasknotesMiniCalendar: "calendar-days",
};

export class BasesViewListSidebarService {
	private workspaceRefs: EventRef[] = [];
	private emitterRefs: EventRef[] = [];
	private managedLeaves = new Map<WorkspaceLeaf, ManagedLeafState>();
	private toolbarTriggers = new Map<WorkspaceLeaf, HTMLElement>();
	private refreshTimer: number | null = null;
	private resizeDrag: ResizeDragState | null = null;
	private running = false;

	private readonly onResizePointerMoveBound = (evt: PointerEvent) => {
		this.onResizePointerMove(evt);
	};

	private readonly onResizePointerUpBound = () => {
		void this.endResizeDrag(true);
	};

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
		this.detachResizeDragListeners();
		this.unbindEvents();
		this.cleanupAllLeaves();
		this.cleanupAllToolbarOpenTriggers();
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
					this.cleanupAllToolbarOpenTriggers();
					this.clearModeClassesFromAllBaseLeaves();
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
			this.cleanupAllToolbarOpenTriggers();
			this.clearModeClassesFromAllBaseLeaves();
			return;
		}

		const leaves = this.plugin.app.workspace.getLeavesOfType("bases") as WorkspaceLeaf[];
		const activeLeaves = new Set(leaves);

		for (const leaf of Array.from(this.managedLeaves.keys())) {
			if (!activeLeaves.has(leaf)) {
				this.cleanupLeaf(leaf);
			}
		}

		for (const leaf of Array.from(this.toolbarTriggers.keys())) {
			if (!activeLeaves.has(leaf)) {
				this.removeToolbarOpenTrigger(leaf);
			}
		}

		await Promise.all(leaves.map((leaf) => this.refreshLeaf(leaf)));
	}

	private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
		if (!this.running) return;

		if (!this.isTargetBaseLeaf(leaf)) {
			this.cleanupLeaf(leaf);
			this.removeToolbarOpenTrigger(leaf);
			return;
		}

		const basesViewEl = this.findBasesViewEl(leaf);
		if (!basesViewEl) return;

		const toolbarEl = this.findToolbarEl(leaf);
		const viewEntries = await this.getViewEntries(leaf);
		if (!this.running) return;

		if (viewEntries.length <= 1) {
			this.cleanupLeaf(leaf);
			this.removeToolbarOpenTrigger(leaf);
			const { rootEl } = this.resolveLayoutContext(basesViewEl);
			if (rootEl) this.removeDropdownModeClasses(rootEl);
			return;
		}

		if (this.isCollapsed()) {
			this.cleanupLeaf(leaf);
			if (toolbarEl) {
				this.ensureToolbarOpenTrigger(leaf, toolbarEl);
			}
			const { rootEl } = this.resolveLayoutContext(basesViewEl);
			if (rootEl) this.applyDropdownModeClasses(rootEl);
			return;
		}

		this.removeToolbarOpenTrigger(leaf);

		const state = this.ensureManagedLayout(leaf, basesViewEl);
		if (!state) return;

		this.applyDropdownModeClasses(state.rootEl);
		this.applyLayoutWidth(state.layoutEl, this.getSavedWidthPx());
		this.ensureResizeHandle(leaf, state);

		const currentViewName = this.getCurrentViewName(leaf);
		this.renderViewList(leaf, state, viewEntries, currentViewName);
	}

	private isFeatureEnabled(): boolean {
		return this.plugin.settings.enableBases && this.plugin.settings.enableBasesViewListSidebar;
	}

	private isCollapsed(): boolean {
		return this.plugin.settings.basesViewListCollapsed === true;
	}

	private getSavedWidthPx(): number {
		return this.clampWidth(this.plugin.settings.basesViewListWidthPx ?? WIDTH_DEFAULT);
	}

	private clampWidth(widthPx: number): number {
		if (!Number.isFinite(widthPx)) return WIDTH_DEFAULT;
		return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(widthPx)));
	}

	private isNarrowLayout(): boolean {
		try {
			return window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
		} catch {
			return false;
		}
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

	private findToolbarEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (!containerEl) return null;
		return containerEl.querySelector<HTMLElement>(".bases-toolbar");
	}

	private ensureManagedLayout(
		leaf: WorkspaceLeaf,
		basesViewEl: HTMLElement
	): ManagedLeafState | null {
		let { rootEl, layoutEl, bodyEl } = this.resolveLayoutContext(basesViewEl);
		if (!rootEl) return null;
		this.removeOrphanLayouts(rootEl, basesViewEl, layoutEl);

		const existing = this.managedLeaves.get(leaf);
		if (existing && (existing.layoutEl !== layoutEl || existing.rootEl !== rootEl)) {
			this.cleanupLeaf(leaf);
		}

		const current = this.managedLeaves.get(leaf);
		if (current) {
			current.rootEl = rootEl;
			if (layoutEl && bodyEl) {
				const listEl = this.findListEl(layoutEl);
				const resizerEl = this.findResizerEl(layoutEl);
				if (listEl && resizerEl) {
					current.layoutEl = layoutEl;
					current.bodyEl = bodyEl;
					current.listEl = listEl;
					current.resizerEl = resizerEl;
				}
			}
			if (current.basesViewEl !== basesViewEl) {
				current.bodyEl.appendChild(basesViewEl);
				current.basesViewEl = basesViewEl;
			}
			return current;
		}

		if (layoutEl && bodyEl) {
			const listEl = this.findListEl(layoutEl);
			let resizerEl = this.findResizerEl(layoutEl);
			if (listEl && !resizerEl) {
				resizerEl = this.createResizerEl(layoutEl.ownerDocument);
				bodyEl.before(resizerEl);
			}
			if (listEl && resizerEl) {
				const state: ManagedLeafState = {
					rootEl,
					layoutEl,
					listEl,
					bodyEl,
					resizerEl,
					basesViewEl,
				};
				if (basesViewEl.parentElement !== bodyEl) {
					bodyEl.appendChild(basesViewEl);
				}
				this.managedLeaves.set(leaf, state);
				return state;
			}

			// Broken wrapper without required children. Reset and rebuild cleanly.
			this.unwrapLayout(layoutEl, basesViewEl);
			rootEl = basesViewEl.parentElement;
			if (!rootEl) return null;
			this.removeOrphanLayouts(rootEl, basesViewEl, null);
		}

		const doc = basesViewEl.ownerDocument;
		layoutEl = doc.createElement("div");
		layoutEl.className = CSS_LAYOUT;

		const listEl = doc.createElement("nav");
		listEl.className = CSS_LIST;
		listEl.setAttribute("aria-label", this.getListLabel());

		const resizerEl = this.createResizerEl(doc);

		bodyEl = doc.createElement("div");
		bodyEl.className = CSS_BODY;

		layoutEl.appendChild(listEl);
		layoutEl.appendChild(resizerEl);
		layoutEl.appendChild(bodyEl);
		basesViewEl.before(layoutEl);
		bodyEl.appendChild(basesViewEl);

		const state: ManagedLeafState = {
			rootEl,
			layoutEl,
			listEl,
			bodyEl,
			resizerEl,
			basesViewEl,
		};
		this.managedLeaves.set(leaf, state);
		return state;
	}

	private resolveLayoutContext(basesViewEl: HTMLElement): {
		rootEl: HTMLElement | null;
		layoutEl: HTMLElement | null;
		bodyEl: HTMLElement | null;
	} {
		let safety = 0;
		while (safety < 8) {
			safety += 1;
			const parentEl = basesViewEl.parentElement;
			if (!parentEl) {
				return { rootEl: null, layoutEl: null, bodyEl: null };
			}

			if (!parentEl.classList.contains(CSS_BODY)) {
				return { rootEl: parentEl, layoutEl: null, bodyEl: null };
			}

			const layoutEl = parentEl.parentElement;
			if (!(layoutEl instanceof HTMLElement) || !layoutEl.classList.contains(CSS_LAYOUT)) {
				return { rootEl: parentEl, layoutEl: null, bodyEl: null };
			}

			const layoutParent = layoutEl.parentElement;
			if (
				layoutParent instanceof HTMLElement &&
				!layoutParent.classList.contains(CSS_BODY) &&
				!layoutParent.classList.contains(CSS_LAYOUT)
			) {
				return { rootEl: layoutParent, layoutEl, bodyEl: parentEl };
			}

			this.unwrapLayout(layoutEl, basesViewEl);
		}

		return {
			rootEl: basesViewEl.parentElement,
			layoutEl: null,
			bodyEl: null,
		};
	}

	private unwrapLayout(layoutEl: HTMLElement, basesViewEl: HTMLElement): void {
		if (layoutEl.contains(basesViewEl)) {
			layoutEl.before(basesViewEl);
		}
		layoutEl.remove();
	}

	private removeOrphanLayouts(
		rootEl: HTMLElement,
		basesViewEl: HTMLElement,
		keepLayoutEl: HTMLElement | null
	): void {
		for (const child of Array.from(rootEl.children)) {
			if (!(child instanceof HTMLElement)) continue;
			if (!child.classList.contains(CSS_LAYOUT)) continue;
			if (keepLayoutEl && child === keepLayoutEl) continue;
			if (child.contains(basesViewEl)) continue;
			child.remove();
		}
	}

	private findListEl(layoutEl: HTMLElement): HTMLElement | null {
		for (const child of Array.from(layoutEl.children)) {
			if (child instanceof HTMLElement && child.classList.contains(CSS_LIST)) {
				return child;
			}
		}
		return null;
	}

	private findResizerEl(layoutEl: HTMLElement): HTMLElement | null {
		for (const child of Array.from(layoutEl.children)) {
			if (child instanceof HTMLElement && child.classList.contains(CSS_RESIZER)) {
				return child;
			}
		}
		return null;
	}

	private createResizerEl(doc: Document): HTMLElement {
		const resizerEl = doc.createElement("div");
		resizerEl.className = CSS_RESIZER;
		resizerEl.setAttribute("role", "separator");
		resizerEl.setAttribute("aria-orientation", "vertical");
		resizerEl.setAttribute("aria-label", this.getResizeHandleAriaLabel());
		resizerEl.setAttribute("title", this.getResizeHandleTooltip());
		return resizerEl;
	}

	private applyLayoutWidth(layoutEl: HTMLElement, widthPx: number): void {
		layoutEl.style.setProperty("--tn-bases-view-list-width", `${this.clampWidth(widthPx)}px`);
	}

	private getLayoutWidth(layoutEl: HTMLElement): number {
		const fromVar = layoutEl.style.getPropertyValue("--tn-bases-view-list-width").trim();
		if (fromVar.endsWith("px")) {
			const parsed = Number.parseInt(fromVar.slice(0, -2), 10);
			if (Number.isFinite(parsed)) return this.clampWidth(parsed);
		}
		return this.getSavedWidthPx();
	}

	private ensureResizeHandle(leaf: WorkspaceLeaf, state: ManagedLeafState): void {
		const { resizerEl } = state;
		resizerEl.setAttribute("aria-label", this.getResizeHandleAriaLabel());
		resizerEl.setAttribute("title", this.getResizeHandleTooltip());
		resizerEl.onpointerdown = (evt) => {
			this.startResizeDrag(leaf, state, evt);
		};
	}

	private startResizeDrag(
		leaf: WorkspaceLeaf,
		state: ManagedLeafState,
		evt: PointerEvent
	): void {
		if (this.isNarrowLayout()) return;
		if (!this.running) return;
		evt.preventDefault();

		if (this.resizeDrag) {
			this.detachResizeDragListeners();
		}

		this.resizeDrag = {
			leaf,
			layoutEl: state.layoutEl,
			startX: evt.clientX,
			startWidth: this.getLayoutWidth(state.layoutEl),
			lastWidth: this.getLayoutWidth(state.layoutEl),
		};

		window.addEventListener("pointermove", this.onResizePointerMoveBound);
		window.addEventListener("pointerup", this.onResizePointerUpBound);
		window.addEventListener("pointercancel", this.onResizePointerUpBound);
	}

	private onResizePointerMove(evt: PointerEvent): void {
		if (!this.resizeDrag) return;
		const deltaX = evt.clientX - this.resizeDrag.startX;
		const nextWidth = this.clampWidth(this.resizeDrag.startWidth + deltaX);
		this.resizeDrag.lastWidth = nextWidth;
		this.applyLayoutWidth(this.resizeDrag.layoutEl, nextWidth);
	}

	private async endResizeDrag(saveWidth: boolean): Promise<void> {
		if (!this.resizeDrag) return;
		const widthToPersist = this.resizeDrag.lastWidth;
		this.detachResizeDragListeners();

		if (saveWidth) {
			await this.persistWidth(widthToPersist);
		}
	}

	private detachResizeDragListeners(): void {
		window.removeEventListener("pointermove", this.onResizePointerMoveBound);
		window.removeEventListener("pointerup", this.onResizePointerUpBound);
		window.removeEventListener("pointercancel", this.onResizePointerUpBound);
		this.resizeDrag = null;
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

	private clearModeClassesFromAllBaseLeaves(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("bases") as WorkspaceLeaf[];
		for (const leaf of leaves) {
			const basesViewEl = this.findBasesViewEl(leaf);
			if (!basesViewEl) continue;
			const { rootEl } = this.resolveLayoutContext(basesViewEl);
			if (rootEl) this.removeDropdownModeClasses(rootEl);
		}
	}

	private cleanupAllLeaves(): void {
		for (const leaf of Array.from(this.managedLeaves.keys())) {
			this.cleanupLeaf(leaf);
		}
	}

	private cleanupLeaf(leaf: WorkspaceLeaf): void {
		const state = this.managedLeaves.get(leaf);
		if (!state) return;

		if (this.resizeDrag?.leaf === leaf) {
			this.detachResizeDragListeners();
		}

		this.removeDropdownModeClasses(state.rootEl);
		if (state.layoutEl.parentElement instanceof HTMLElement) {
			this.removeDropdownModeClasses(state.layoutEl.parentElement);
		}

		if (state.layoutEl.isConnected) {
			if (state.layoutEl.contains(state.basesViewEl)) {
				state.layoutEl.before(state.basesViewEl);
			} else {
				const currentBasesView = state.layoutEl.querySelector<HTMLElement>(".bases-view");
				if (currentBasesView) {
					state.layoutEl.before(currentBasesView);
				}
			}
			state.layoutEl.remove();
		}

		this.managedLeaves.delete(leaf);
	}

	private cleanupAllToolbarOpenTriggers(): void {
		for (const leaf of Array.from(this.toolbarTriggers.keys())) {
			this.removeToolbarOpenTrigger(leaf);
		}
	}

	private ensureToolbarOpenTrigger(leaf: WorkspaceLeaf, toolbarEl: HTMLElement): void {
		this.removeToolbarOpenTrigger(leaf);

		const doc = toolbarEl.ownerDocument;
		const itemEl = doc.createElement("div");
		itemEl.className = `bases-toolbar-item ${CSS_OPEN_TRIGGER}`;

		const buttonEl = doc.createElement("button");
		buttonEl.type = "button";
		buttonEl.className = "clickable-icon";
		buttonEl.setAttribute("aria-label", this.getOpenButtonAriaLabel());
		buttonEl.setAttribute("title", this.getOpenButtonTooltip());
		setIcon(buttonEl, "list-plus");
		buttonEl.addEventListener("click", () => {
			void this.setCollapsed(false);
		});

		itemEl.appendChild(buttonEl);
		toolbarEl.insertBefore(itemEl, toolbarEl.firstElementChild);
		this.toolbarTriggers.set(leaf, itemEl);
	}

	private removeToolbarOpenTrigger(leaf: WorkspaceLeaf): void {
		const existing = this.toolbarTriggers.get(leaf);
		if (existing?.isConnected) {
			existing.remove();
		}
		this.toolbarTriggers.delete(leaf);

		const toolbarEl = this.findToolbarEl(leaf);
		if (!toolbarEl) return;
		for (const duplicate of Array.from(toolbarEl.querySelectorAll<HTMLElement>(`.${CSS_OPEN_TRIGGER}`))) {
			duplicate.remove();
		}
	}

	private getListLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.title",
			"Views"
		);
	}

	private getOpenButtonAriaLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.openButton.ariaLabel",
			"Open view list"
		);
	}

	private getOpenButtonTooltip(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.openButton.tooltip",
			"Open view list"
		);
	}

	private getCloseButtonAriaLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.closeButton.ariaLabel",
			"Close view list"
		);
	}

	private getCloseButtonTooltip(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.closeButton.tooltip",
			"Close view list"
		);
	}

	private getResizeHandleAriaLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.resizeHandle.ariaLabel",
			"Resize view list width"
		);
	}

	private getResizeHandleTooltip(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.resizeHandle.tooltip",
			"Drag to resize"
		);
	}

	private translateWithFallback(key: string, fallback: string): string {
		const text = this.plugin.i18n.translate(key as any);
		if (typeof text !== "string" || text === key) {
			return fallback;
		}
		return text;
	}

	private renderViewList(
		leaf: WorkspaceLeaf,
		state: ManagedLeafState,
		viewEntries: ViewEntry[],
		currentViewName: string | null
	): void {
		const { listEl } = state;
		listEl.innerHTML = "";

		const doc = listEl.ownerDocument;
		const headerEl = doc.createElement("div");
		headerEl.className = CSS_HEADER;

		const closeButton = doc.createElement("button");
		closeButton.type = "button";
		closeButton.className = CSS_CLOSE;
		closeButton.setAttribute("aria-label", this.getCloseButtonAriaLabel());
		closeButton.setAttribute("title", this.getCloseButtonTooltip());
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.setCollapsed(true);
		});

		const titleEl = doc.createElement("div");
		titleEl.className = CSS_TITLE;
		titleEl.textContent = this.getListLabel();

		headerEl.appendChild(closeButton);
		headerEl.appendChild(titleEl);
		listEl.appendChild(headerEl);

		for (const entry of viewEntries) {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = CSS_ITEM;
			button.setAttribute("data-view-name", entry.name);
			button.setAttribute("aria-label", entry.name);

			const iconEl = doc.createElement("span");
			iconEl.className = CSS_ITEM_ICON;
			setIcon(iconEl, entry.icon);

			const labelEl = doc.createElement("span");
			labelEl.textContent = entry.name;

			button.appendChild(iconEl);
			button.appendChild(labelEl);

			if (currentViewName && currentViewName === entry.name) {
				button.classList.add(CSS_ITEM_ACTIVE);
			}

			button.addEventListener("click", () => {
				void this.switchView(leaf, entry.name);
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

	private async getViewEntries(leaf: WorkspaceLeaf): Promise<ViewEntry[]> {
		const controller = this.getController(leaf);
		const fromController = this.getViewEntriesFromController(controller);
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

			const entries = parsed.views.map((view): Partial<ViewEntry> => {
				if (typeof view !== "object" || view === null) return {};
				const maybeView = view as { name?: unknown; type?: unknown };
				return {
					name: typeof maybeView.name === "string" ? maybeView.name : "",
					type: typeof maybeView.type === "string" ? maybeView.type : null,
				};
			});

			return this.normalizeViewEntries(entries);
		} catch {
			return [];
		}
	}

	private getViewEntriesFromController(controller: BasesControllerLike | null): ViewEntry[] {
		if (!controller) return [];

		if (Array.isArray(controller.query?.views)) {
			const fromQuery = controller.query.views.map((view): Partial<ViewEntry> => ({
				name: typeof view?.name === "string" ? view.name : "",
				type: typeof view?.type === "string" ? view.type : null,
			}));
			const normalized = this.normalizeViewEntries(fromQuery);
			if (normalized.length > 0) {
				return normalized;
			}
		}

		if (typeof controller.getQueryViewNames === "function") {
			try {
				const raw = controller.getQueryViewNames();
				if (Array.isArray(raw)) {
					return this.normalizeViewEntries(
						raw
							.filter((item): item is string => typeof item === "string")
							.map((name) => ({ name, type: null }))
					);
				}
			} catch {
				// Ignore and continue fallback chain
			}
		}

		return [];
	}

	private normalizeViewEntries(entries: Partial<ViewEntry>[]): ViewEntry[] {
		const seen = new Set<string>();
		const normalized: ViewEntry[] = [];

		for (const entry of entries) {
			const rawName = typeof entry.name === "string" ? entry.name : "";
			const name = rawName.trim();
			if (!name || seen.has(name)) continue;

			seen.add(name);
			const type = typeof entry.type === "string" && entry.type.trim().length > 0
				? entry.type.trim()
				: null;

			normalized.push({
				name,
				type,
				icon: this.resolveViewIcon(type),
			});
		}

		return normalized;
	}

	private resolveViewIcon(viewType: string | null): string {
		if (viewType) {
			const registrationIcon = this.getRegistrationIconForType(viewType);
			if (registrationIcon) return registrationIcon;

			const known = KNOWN_VIEW_ICONS[viewType];
			if (known) return known;
		}
		return "list";
	}

	private getRegistrationIconForType(viewType: string): string | null {
		const registrations = this.getBasesRegistrations();
		if (!registrations) return null;
		const rawIcon = registrations[viewType]?.icon;
		if (typeof rawIcon !== "string" || rawIcon.trim().length === 0) {
			return null;
		}
		return this.normalizeIconId(rawIcon);
	}

	private getBasesRegistrations(): BasesRegistrationMap | null {
		try {
			const appWithInternal = this.plugin.app as unknown as {
				internalPlugins?: {
					getEnabledPluginById?: (id: string) => { registrations?: BasesRegistrationMap } | null;
				};
			};
			const basesPlugin = appWithInternal.internalPlugins?.getEnabledPluginById?.("bases");
			if (!basesPlugin || !basesPlugin.registrations) {
				return null;
			}
			return basesPlugin.registrations;
		} catch {
			return null;
		}
	}

	private normalizeIconId(rawIcon: string): string {
		let icon = rawIcon.trim();
		if (!icon) return "list";
		if (icon.startsWith("lucide-")) {
			icon = icon.slice("lucide-".length).trim();
		}
		if (!icon) return "list";
		// Lucide icon ids are kebab-case ASCII; reject obviously invalid values.
		if (!/^[a-z0-9-]+$/i.test(icon)) {
			return "list";
		}
		return icon;
	}

	private async setCollapsed(collapsed: boolean): Promise<void> {
		if (this.plugin.settings.basesViewListCollapsed === collapsed) return;
		this.plugin.settings.basesViewListCollapsed = collapsed;
		this.scheduleRefresh(0);
		await this.persistSettings();
	}

	private async persistWidth(widthPx: number): Promise<void> {
		const clampedWidth = this.clampWidth(widthPx);
		if (this.plugin.settings.basesViewListWidthPx === clampedWidth) return;
		this.plugin.settings.basesViewListWidthPx = clampedWidth;
		await this.persistSettings();
	}

	private async persistSettings(): Promise<void> {
		const pluginWithSave = this.plugin as unknown as {
			saveSettings?: () => Promise<void>;
		};
		if (typeof pluginWithSave.saveSettings !== "function") return;

		try {
			await pluginWithSave.saveSettings();
		} catch (error) {
			console.warn("[TaskNotes][Bases] Failed to persist view list settings", error);
		}
	}
}
