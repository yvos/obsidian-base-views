import { EventRef, Menu, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { openNativeViewSettingsAtAnchor } from "../integrations/bases/nativeViewSettingsBridge";
import { showTextInputModal } from "../modals/TextInputModal";
import { BaseViewListYamlStore } from "./BaseViewListYamlStore";

type DropdownMode = "list-only" | "combined";
type LayoutPlacement = "left" | "top";
type FontSizeOption = "m" | "s" | "xs";
type TopOverflowMode = "wrap" | "scroll";
type NarrowBehavior = "none" | "top" | "hide";

interface BasesSubViewLike {
	name?: unknown;
	type?: unknown;
	get?: (key: string) => unknown;
	[key: string]: unknown;
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
	propertyText: string | null;
	descriptionText: string | null;
}

interface ManagedLeafState {
	rootEl: HTMLElement;
	placement: LayoutPlacement;
	layoutEl: HTMLElement;
	listEl: HTMLElement;
	bodyEl: HTMLElement | null;
	resizerEl: HTMLElement | null;
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

interface PartialViewEntry {
	name?: unknown;
	type?: unknown;
	propertyText?: string | null;
	descriptionText?: string | null;
}

interface EffectiveLayoutResolution {
	placement: LayoutPlacement;
	forceTopScroll: boolean;
	temporaryHidden: boolean;
}

interface PreferredWidthResult {
	widthPx: number;
	source: "file" | "default";
}

const CSS_LAYOUT = "tn-bases-view-list-layout";
const CSS_LAYOUT_TOP = "tn-bases-view-list-top-layout";
const CSS_LIST = "tn-bases-view-list";
const CSS_LIST_TOP = "tn-bases-view-list--top";
const CSS_LIST_TOP_WRAP = "tn-bases-view-list--top-wrap";
const CSS_LIST_TOP_SCROLL = "tn-bases-view-list--top-scroll";
const CSS_LIST_ICONS_OFF = "tn-bases-view-list--icons-off";
const CSS_BODY = "tn-bases-view-list-body";
const CSS_ITEM = "tn-bases-view-list__item";
const CSS_ITEM_ROW = "tn-bases-view-list__item-row";
const CSS_ITEM_ACTIVE = "is-active";
const CSS_ITEM_WITH_PROPERTY = "tn-bases-view-list__item--with-property";
const CSS_ITEM_ICON = "tn-bases-view-list__item-icon";
const CSS_ITEM_CONTENT = "tn-bases-view-list__item-content";
const CSS_ITEM_NAME = "tn-bases-view-list__item-name";
const CSS_ITEM_PROPERTY = "tn-bases-view-list__item-property";
const CSS_ITEM_PROPERTY_PLACEHOLDER = "tn-bases-view-list__item-property--placeholder";
const CSS_ITEM_MENU_BUTTON = "tn-bases-view-list__item-menu";
const CSS_HEADER = "tn-bases-view-list__header";
const CSS_HEADER_TOP = "tn-bases-view-list__header--top";
const CSS_TITLE = "tn-bases-view-list__title";
const CSS_CLOSE = "tn-bases-view-list__close";
const CSS_CLOSE_SMALL = "tn-bases-view-list__close--small";
const CSS_RESIZER = "tn-bases-view-list__resizer";
const CSS_OPEN_TRIGGER = "tn-bases-view-list-open-trigger";
const CSS_MODE_LIST_ONLY = "tn-bases-view-list-mode-list-only";
const CSS_MODE_COMBINED = "tn-bases-view-list-mode-combined";
const CSS_NATIVE_TOOLBAR_HIDDEN = "tn-bases-native-toolbar-hidden";
const CSS_FONT_M = "tn-bases-view-list-font-m";
const CSS_FONT_S = "tn-bases-view-list-font-s";
const CSS_FONT_XS = "tn-bases-view-list-font-xs";
const VIEW_SETTINGS_DEBUG_PREFIX = "[TaskNotes][Bases][ViewSettings]";

const WIDTH_MIN = 140;
const WIDTH_MAX = 520;
const WIDTH_DEFAULT = 220;
const NARROW_THRESHOLD_MIN = 320;
const NARROW_THRESHOLD_MAX = 2400;
const NARROW_THRESHOLD_DEFAULT = 800;

const KNOWN_VIEW_ICONS: Record<string, string> = {
	table: "table",
	cards: "layout-grid",
	list: "list",
	tasknotesCustomTable: "table-cells-merge",
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
	private resizeObservers = new Map<WorkspaceLeaf, ResizeObserver>();
	private yamlStore: BaseViewListYamlStore;
	private refreshTimer: number | null = null;
	private resizeDrag: ResizeDragState | null = null;
	private running = false;

	private readonly onResizePointerMoveBound = (evt: PointerEvent) => {
		this.onResizePointerMove(evt);
	};

	private readonly onResizePointerUpBound = () => {
		void this.endResizeDrag(true);
	};

	constructor(private plugin: TaskNotesPlugin) {
		this.yamlStore = new BaseViewListYamlStore(plugin);
	}

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
		this.cleanupAllResizeObservers();
		this.cleanupAllLeaves();
		this.cleanupAllToolbarOpenTriggers();
		this.clearModeClassesFromAllBaseLeaves();
		this.clearNativeToolbarClassesFromAllBaseLeaves();
		this.yamlStore.clearCache();
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
					this.cleanupAllResizeObservers();
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

	private logViewSettingsDebug(message: string, details?: Record<string, unknown>): void {
		try {
			if (details) {
				console.log(VIEW_SETTINGS_DEBUG_PREFIX, message, details);
				return;
			}
			console.log(VIEW_SETTINGS_DEBUG_PREFIX, message);
		} catch {
			// Ignore logging failures.
		}
	}

	private async refreshAll(): Promise<void> {
		if (!this.running) return;

		if (!this.isFeatureEnabled()) {
			this.cleanupAllLeaves();
			this.cleanupAllToolbarOpenTriggers();
			this.cleanupAllResizeObservers();
			this.clearModeClassesFromAllBaseLeaves();
			this.clearNativeToolbarClassesFromAllBaseLeaves();
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

		for (const leaf of Array.from(this.resizeObservers.keys())) {
			if (!activeLeaves.has(leaf)) {
				this.removeResizeObserverForLeaf(leaf);
			}
		}

		await Promise.all(leaves.map((leaf) => this.refreshLeaf(leaf)));
	}

	private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
		if (!this.running) return;

		if (!this.isTargetBaseLeaf(leaf)) {
			this.cleanupLeaf(leaf);
			this.removeToolbarOpenTrigger(leaf);
			this.removeResizeObserverForLeaf(leaf);
			this.removeNativeToolbarClassesForLeaf(leaf);
			return;
		}

		this.ensureResizeObserverForLeaf(leaf);

		const basesViewEl = this.findBasesViewEl(leaf);
		if (!basesViewEl) return;

		const toolbarEl = this.findToolbarEl(leaf);
		const viewEntries = await this.getViewEntries(leaf);
		if (!this.running) return;
		const rootEl = this.resolveRootEl(leaf, basesViewEl);

		if (viewEntries.length <= 1) {
			this.cleanupLeaf(leaf);
			this.removeToolbarOpenTrigger(leaf);
			this.removeModeClassesForLeaf(leaf, basesViewEl);
			if (rootEl) this.applyNativeToolbarVisibility(rootEl, false);
			return;
		}

		const layoutResolution = this.resolveEffectiveLayout(leaf);
		if (layoutResolution.temporaryHidden) {
			this.cleanupLeaf(leaf);
			this.removeToolbarOpenTrigger(leaf);
			if (rootEl) this.applyDropdownModeClasses(rootEl);
			if (rootEl) this.applyNativeToolbarVisibility(rootEl, false);
			return;
		}

		if (this.isCollapsed()) {
			this.cleanupLeaf(leaf);
			if (toolbarEl) {
				this.ensureToolbarOpenTrigger(leaf, toolbarEl);
			}
			if (rootEl) this.applyDropdownModeClasses(rootEl);
			if (rootEl) this.applyNativeToolbarVisibility(rootEl, false);
			return;
		}

		this.removeToolbarOpenTrigger(leaf);

		const placement = layoutResolution.placement;
		const existing = this.managedLeaves.get(leaf);
		if (existing && existing.placement !== placement) {
			this.cleanupLeaf(leaf);
		}

		let state: ManagedLeafState | null = null;
		if (placement === "top") {
			state = this.ensureManagedLayoutTop(leaf, basesViewEl);
		} else {
			state = this.ensureManagedLayoutLeft(leaf, basesViewEl);
		}
		if (!state) return;

		this.applyDropdownModeClasses(state.rootEl);
		this.applyNativeToolbarVisibility(state.rootEl, !this.shouldShowNativeToolbar());
		this.applyFontSizeClasses(state.listEl);
		this.applyIconVisibilityClasses(state.listEl);
		this.applyTopOverflowClasses(
			state.listEl,
			state.placement,
			layoutResolution.forceTopScroll ? "scroll" : this.getTopOverflowMode()
		);

		let preferredWidth: PreferredWidthResult | null = null;

		if (state.placement === "left") {
			preferredWidth = await this.getPreferredWidth(leaf);
			if (!this.running) return;
			this.applyLayoutWidth(state.layoutEl, preferredWidth.widthPx);
			this.ensureResizeHandle(leaf, state);
		} else {
			if (this.resizeDrag?.leaf === leaf) {
				this.detachResizeDragListeners();
			}
		}

		const currentViewName = this.getCurrentViewName(leaf);
		this.renderViewList(leaf, state, viewEntries, currentViewName);
		this.ensureListContextMenu(leaf, state.listEl, viewEntries);

		if (state.placement === "left" && preferredWidth) {
			this.applyAutoShrinkWidthIfEligible(leaf, state, viewEntries, preferredWidth);
		}
	}

	private isFeatureEnabled(): boolean {
		return this.plugin.settings.enableBases && this.plugin.settings.enableBasesViewListSidebar;
	}

	private isCollapsed(): boolean {
		return this.plugin.settings.basesViewListCollapsed === true;
	}

	private getPlacement(): LayoutPlacement {
		return this.plugin.settings.basesViewListPlacement === "top" ? "top" : "left";
	}

	private getFontSize(): FontSizeOption {
		const value = this.plugin.settings.basesViewListFontSize;
		if (value === "s" || value === "xs") return value;
		return "m";
	}

	private shouldShowIcons(): boolean {
		return this.plugin.settings.basesViewListShowIcons !== false;
	}

	private shouldShowNativeToolbar(): boolean {
		return this.plugin.settings.basesViewListShowNativeToolbar !== false;
	}

	private getTopOverflowMode(): TopOverflowMode {
		return this.plugin.settings.basesViewListTopOverflowMode === "scroll" ? "scroll" : "wrap";
	}

	private getNarrowBehavior(): NarrowBehavior {
		const value = this.plugin.settings.basesViewListNarrowBehavior;
		if (value === "none" || value === "hide") return value;
		return "top";
	}

	private getNarrowThresholdPx(): number {
		const raw = this.plugin.settings.basesViewListNarrowThresholdPx;
		if (!Number.isFinite(raw)) return NARROW_THRESHOLD_DEFAULT;
		return Math.max(
			NARROW_THRESHOLD_MIN,
			Math.min(NARROW_THRESHOLD_MAX, Math.round(raw))
		);
	}

	private shouldShowProperty(): boolean {
		return this.plugin.settings.basesViewListShowProperty === true && this.getPropertyKey().length > 0;
	}

	private getPropertyKey(): string {
		const key = this.plugin.settings.basesViewListPropertyKey;
		return typeof key === "string" ? key.trim() : "";
	}

	private clampWidth(widthPx: number): number {
		if (!Number.isFinite(widthPx)) return WIDTH_DEFAULT;
		return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, Math.round(widthPx)));
	}

	private getLeafContainerWidth(leaf: WorkspaceLeaf): number {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (containerEl && containerEl.clientWidth > 0) {
			return containerEl.clientWidth;
		}

		const basesViewEl = this.findBasesViewEl(leaf);
		if (basesViewEl && basesViewEl.clientWidth > 0) {
			return basesViewEl.clientWidth;
		}

		return typeof window.innerWidth === "number" ? window.innerWidth : 0;
	}

	private isLeafNarrow(leaf: WorkspaceLeaf): boolean {
		const width = this.getLeafContainerWidth(leaf);
		if (width <= 0) return false;
		return width <= this.getNarrowThresholdPx();
	}

	private resolveEffectiveLayout(leaf: WorkspaceLeaf): EffectiveLayoutResolution {
		const userPlacement = this.getPlacement();
		const isNarrow = this.isLeafNarrow(leaf);
		if (!isNarrow) {
			return {
				placement: userPlacement,
				forceTopScroll: false,
				temporaryHidden: false,
			};
		}

		const behavior = this.getNarrowBehavior();
		if (behavior === "hide") {
			return {
				placement: userPlacement,
				forceTopScroll: false,
				temporaryHidden: true,
			};
		}
		if (behavior === "top" && userPlacement === "left") {
			return {
				placement: "top",
				forceTopScroll: true,
				temporaryHidden: false,
			};
		}
		if (behavior === "top") {
			return {
				placement: "top",
				forceTopScroll: true,
				temporaryHidden: false,
			};
		}

		return {
			placement: userPlacement,
			forceTopScroll: false,
			temporaryHidden: false,
		};
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

	private findHeaderEl(leaf: WorkspaceLeaf): HTMLElement | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (!containerEl) return null;
		return containerEl.querySelector<HTMLElement>(".bases-header");
	}

	private resolveRootEl(leaf: WorkspaceLeaf, basesViewEl: HTMLElement): HTMLElement | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (containerEl) return containerEl;
		const { rootEl } = this.resolveLayoutContext(basesViewEl);
		return rootEl;
	}

	private ensureManagedLayoutLeft(
		leaf: WorkspaceLeaf,
		basesViewEl: HTMLElement
	): ManagedLeafState | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (containerEl) {
			this.removeAllTopLayouts(containerEl);
		}

		let { rootEl, layoutEl, bodyEl } = this.resolveLayoutContext(basesViewEl);
		if (!rootEl) return null;
		this.removeOrphanLayouts(rootEl, basesViewEl, layoutEl);

		const existing = this.managedLeaves.get(leaf);
		if (existing && existing.placement !== "left") {
			this.cleanupLeaf(leaf);
		}

		const current = this.managedLeaves.get(leaf);
		if (current && current.placement === "left") {
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
			if (current.basesViewEl !== basesViewEl && current.bodyEl) {
				current.bodyEl.appendChild(basesViewEl);
				current.basesViewEl = basesViewEl;
			}
			current.listEl.classList.remove(CSS_LIST_TOP);
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
				listEl.classList.remove(CSS_LIST_TOP);
				const state: ManagedLeafState = {
					rootEl,
					placement: "left",
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
		listEl.setAttribute("aria-label", this.getListAriaLabel(leaf));

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
			placement: "left",
			layoutEl,
			listEl,
			bodyEl,
			resizerEl,
			basesViewEl,
		};
		this.managedLeaves.set(leaf, state);
		return state;
	}

	private ensureManagedLayoutTop(
		leaf: WorkspaceLeaf,
		basesViewEl: HTMLElement
	): ManagedLeafState | null {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (!containerEl) return null;

		const leftContext = this.resolveLayoutContext(basesViewEl);
		if (leftContext.layoutEl) {
			this.unwrapLayout(leftContext.layoutEl, basesViewEl);
		}

		const existing = this.managedLeaves.get(leaf);
		if (existing && existing.placement !== "top") {
			this.cleanupLeaf(leaf);
		}

		const topLayouts = Array.from(containerEl.querySelectorAll<HTMLElement>(`.${CSS_LAYOUT_TOP}`));
		let layoutEl = topLayouts[0] ?? null;
		for (const duplicate of topLayouts.slice(1)) {
			duplicate.remove();
		}

		const current = this.managedLeaves.get(leaf);
		if (current && current.placement === "top") {
			if (layoutEl) {
				current.layoutEl = layoutEl;
			}
			this.ensureTopLayoutPosition(leaf, current.layoutEl, basesViewEl);
			let listEl = this.findListEl(current.layoutEl);
			if (!listEl) {
				listEl = current.layoutEl.ownerDocument.createElement("nav");
				listEl.className = CSS_LIST;
				current.layoutEl.appendChild(listEl);
			}
			current.listEl = listEl;
			current.listEl.classList.add(CSS_LIST_TOP);
			current.listEl.setAttribute("aria-label", this.getListAriaLabel(leaf));
			current.rootEl = containerEl;
			current.basesViewEl = basesViewEl;
			return current;
		}

		if (!layoutEl) {
			layoutEl = containerEl.ownerDocument.createElement("div");
			layoutEl.className = CSS_LAYOUT_TOP;
		}

		let listEl = this.findListEl(layoutEl);
		if (!listEl) {
			listEl = layoutEl.ownerDocument.createElement("nav");
			listEl.className = CSS_LIST;
			layoutEl.appendChild(listEl);
		}
		listEl.classList.add(CSS_LIST_TOP);
		listEl.setAttribute("aria-label", this.getListAriaLabel(leaf));
		this.ensureTopLayoutPosition(leaf, layoutEl, basesViewEl);

		const state: ManagedLeafState = {
			rootEl: containerEl,
			placement: "top",
			layoutEl,
			listEl,
			bodyEl: null,
			resizerEl: null,
			basesViewEl,
		};
		this.managedLeaves.set(leaf, state);
		return state;
	}

	private ensureTopLayoutPosition(
		leaf: WorkspaceLeaf,
		layoutEl: HTMLElement,
		basesViewEl: HTMLElement
	): void {
		const headerEl = this.findHeaderEl(leaf);
		if (headerEl?.parentElement) {
			headerEl.after(layoutEl);
			return;
		}

		const toolbarEl = this.findToolbarEl(leaf);
		if (toolbarEl?.parentElement) {
			toolbarEl.before(layoutEl);
			return;
		}

		basesViewEl.before(layoutEl);
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

	private removeAllTopLayouts(containerEl: HTMLElement): void {
		for (const layoutEl of Array.from(containerEl.querySelectorAll<HTMLElement>(`.${CSS_LAYOUT_TOP}`))) {
			layoutEl.remove();
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
		return WIDTH_DEFAULT;
	}

	private ensureResizeHandle(leaf: WorkspaceLeaf, state: ManagedLeafState): void {
		if (state.placement !== "left" || !state.resizerEl) return;
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
		if (state.placement !== "left") return;
		if (this.isLeafNarrow(leaf)) return;
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
		const { leaf } = this.resizeDrag;
		const widthToPersist = this.resizeDrag.lastWidth;
		this.detachResizeDragListeners();

		if (saveWidth) {
			await this.persistWidthForLeaf(leaf, widthToPersist);
		}
	}

	private detachResizeDragListeners(): void {
		window.removeEventListener("pointermove", this.onResizePointerMoveBound);
		window.removeEventListener("pointerup", this.onResizePointerUpBound);
		window.removeEventListener("pointercancel", this.onResizePointerUpBound);
		this.resizeDrag = null;
	}

	private ensureResizeObserverForLeaf(leaf: WorkspaceLeaf): void {
		if (this.resizeObservers.has(leaf)) return;
		if (typeof ResizeObserver === "undefined") return;

		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (!containerEl) return;

		try {
			const observer = new ResizeObserver(() => {
				this.scheduleRefresh(50);
			});
			observer.observe(containerEl);
			this.resizeObservers.set(leaf, observer);
		} catch {
			// Ignore observer failures and keep polling via workspace events.
		}
	}

	private removeResizeObserverForLeaf(leaf: WorkspaceLeaf): void {
		const observer = this.resizeObservers.get(leaf);
		if (observer) {
			observer.disconnect();
		}
		this.resizeObservers.delete(leaf);
	}

	private cleanupAllResizeObservers(): void {
		for (const leaf of Array.from(this.resizeObservers.keys())) {
			this.removeResizeObserverForLeaf(leaf);
		}
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

	private removeModeClassesForLeaf(leaf: WorkspaceLeaf, basesViewEl: HTMLElement): void {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (containerEl) {
			this.removeDropdownModeClasses(containerEl);
			this.applyNativeToolbarVisibility(containerEl, false);
		}
		const { rootEl } = this.resolveLayoutContext(basesViewEl);
		if (rootEl) {
			this.removeDropdownModeClasses(rootEl);
			this.applyNativeToolbarVisibility(rootEl, false);
		}
	}

	private clearModeClassesFromAllBaseLeaves(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("bases") as WorkspaceLeaf[];
		for (const leaf of leaves) {
			const containerEl = this.getLeafView(leaf)?.containerEl;
			if (containerEl) {
				this.removeDropdownModeClasses(containerEl);
			}
			const basesViewEl = this.findBasesViewEl(leaf);
			if (!basesViewEl) continue;
			const { rootEl } = this.resolveLayoutContext(basesViewEl);
			if (rootEl) this.removeDropdownModeClasses(rootEl);
		}
	}

	private applyNativeToolbarVisibility(rootEl: HTMLElement, hidden: boolean): void {
		rootEl.classList.toggle(CSS_NATIVE_TOOLBAR_HIDDEN, hidden);
	}

	private removeNativeToolbarClassesForLeaf(leaf: WorkspaceLeaf): void {
		const containerEl = this.getLeafView(leaf)?.containerEl;
		if (containerEl) {
			this.applyNativeToolbarVisibility(containerEl, false);
		}
		const basesViewEl = this.findBasesViewEl(leaf);
		if (!basesViewEl) return;
		const { rootEl } = this.resolveLayoutContext(basesViewEl);
		if (rootEl) this.applyNativeToolbarVisibility(rootEl, false);
	}

	private clearNativeToolbarClassesFromAllBaseLeaves(): void {
		const leaves = this.plugin.app.workspace.getLeavesOfType("bases") as WorkspaceLeaf[];
		for (const leaf of leaves) {
			this.removeNativeToolbarClassesForLeaf(leaf);
		}
	}

	private applyFontSizeClasses(listEl: HTMLElement): void {
		listEl.classList.remove(CSS_FONT_M, CSS_FONT_S, CSS_FONT_XS);
		switch (this.getFontSize()) {
			case "s":
				listEl.classList.add(CSS_FONT_S);
				break;
			case "xs":
				listEl.classList.add(CSS_FONT_XS);
				break;
			default:
				listEl.classList.add(CSS_FONT_M);
				break;
		}
	}

	private applyIconVisibilityClasses(listEl: HTMLElement): void {
		listEl.classList.toggle(CSS_LIST_ICONS_OFF, !this.shouldShowIcons());
	}

	private applyTopOverflowClasses(
		listEl: HTMLElement,
		placement: LayoutPlacement,
		mode: TopOverflowMode
	): void {
		listEl.classList.toggle(CSS_LIST_TOP, placement === "top");
		listEl.classList.remove(CSS_LIST_TOP_WRAP, CSS_LIST_TOP_SCROLL);
		if (placement !== "top") return;
		listEl.classList.add(mode === "scroll" ? CSS_LIST_TOP_SCROLL : CSS_LIST_TOP_WRAP);
	}

	private ensureListContextMenu(
		leaf: WorkspaceLeaf,
		listEl: HTMLElement,
		viewEntries: ViewEntry[]
	): void {
		const entriesByName = new Map(viewEntries.map((entry) => [entry.name, entry]));
		listEl.oncontextmenu = (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			const target = evt.target instanceof HTMLElement ? evt.target : null;
			const rowContainerEl =
				target?.closest(`.${CSS_ITEM_ROW}`) ?? target?.closest(`.${CSS_ITEM}`);
			if (rowContainerEl instanceof HTMLElement && listEl.contains(rowContainerEl)) {
				const viewName = rowContainerEl.getAttribute("data-view-name")?.trim() ?? "";
				const entry = entriesByName.get(viewName) ?? null;
				if (entry) {
					this.showViewItemContextMenu(evt, leaf, entry);
					return;
				}
			}
			this.showPlacementContextMenu(evt, leaf);
		};
	}

	private showPlacementContextMenu(event: MouseEvent, leaf: WorkspaceLeaf): void {
		const current = this.getPlacement();
		const menu = new Menu();
		this.addViewListContextMenuItems(menu, current, leaf);
		menu.showAtMouseEvent(event);
	}

	private showViewItemContextMenu(
		event: MouseEvent,
		leaf: WorkspaceLeaf,
		entry: ViewEntry
	): void {
		const current = this.getPlacement();
		const menu = new Menu();
		menu.addItem((item) => {
			item.setTitle(this.getContextMenuEditDescriptionLabel());
			item.onClick(() => {
				void this.editViewDescription(leaf, entry);
			});
		});
		menu.addSeparator();
		this.addViewListContextMenuItems(menu, current, leaf);
		menu.showAtMouseEvent(event);
	}

	private async openNativeViewSettingsFromItemMenu(
		leaf: WorkspaceLeaf,
		entry: ViewEntry,
		anchorEl: HTMLElement
	): Promise<void> {
		this.logViewSettingsDebug("item-menu.open.start", {
			viewName: entry.name,
			anchorConnected: anchorEl.isConnected,
		});
		const leafContainerEl = this.getLeafView(leaf)?.containerEl;
		const basesViewEl = this.findBasesViewEl(leaf);
		const rootEl =
			leafContainerEl ??
			(basesViewEl ? this.resolveLayoutContext(basesViewEl).rootEl : null);
		if (!rootEl) {
			this.logViewSettingsDebug("item-menu.open.failed", {
				reason: "root-missing",
				viewName: entry.name,
			});
			new Notice(this.getNativeViewSettingsOpenFailedNotice());
			return;
		}
		const hiddenByClass = rootEl.classList.contains(CSS_NATIVE_TOOLBAR_HIDDEN);
		const hiddenBySetting = this.plugin.settings.basesViewListShowNativeToolbar === false;
		if (hiddenByClass || hiddenBySetting) {
			// Permanent ON fallback per user request: when opening from 3-dot, keep native toolbar shown.
			rootEl.classList.remove(CSS_NATIVE_TOOLBAR_HIDDEN);
			if (hiddenBySetting) {
				this.plugin.settings.basesViewListShowNativeToolbar = true;
				void this.persistSettings();
			}
			this.logViewSettingsDebug("item-menu.open.force-native-toolbar-on", {
				hiddenByClass,
				hiddenBySetting,
			});
			await this.waitForNativeToolbarLayoutReady(rootEl);
		}

		const result = await openNativeViewSettingsAtAnchor({
			rootEl,
			viewName: entry.name,
			anchorEl,
			nativeToolbarHiddenClass: CSS_NATIVE_TOOLBAR_HIDDEN,
		});
		this.logViewSettingsDebug("item-menu.open.result", {
			viewName: entry.name,
			status: result.status,
			reason: result.reason ?? null,
		});

		if (result.status === "opened-settings") {
			return;
		}

		if (result.status === "opened-view-list-only") {
			this.logViewSettingsDebug("item-menu.open.notice-partial", {
				viewName: entry.name,
				reason: result.reason ?? null,
			});
			new Notice(this.getNativeViewSettingsOpenPartialNotice());
		} else {
			this.logViewSettingsDebug("item-menu.open.notice-failed", {
				viewName: entry.name,
				reason: result.reason ?? null,
			});
			new Notice(this.getNativeViewSettingsOpenFailedNotice());
		}
	}

	private addViewListContextMenuItems(
		menu: Menu,
		current: LayoutPlacement,
		leaf: WorkspaceLeaf
	): void {
		const showProperty = this.plugin.settings.basesViewListShowProperty === true;
		const showNativeToolbar = this.shouldShowNativeToolbar();
		const fontSize = this.getFontSize();
		menu.addItem((item) => {
			item.setTitle(
				showProperty
					? this.getContextMenuHidePropertyLabel()
					: this.getContextMenuShowPropertyLabel()
			);
			item.onClick(() => {
				void this.setShowProperty(!showProperty);
			});
		});
		menu.addItem((item) => {
			item.setTitle(
				showNativeToolbar
					? this.getContextMenuHideNativeToolbarLabel()
					: this.getContextMenuShowNativeToolbarLabel()
			);
			item.onClick(() => {
				void this.setShowNativeToolbar(!showNativeToolbar);
			});
		});
		menu.addSeparator();
		this.addFontSizeMenuItems(menu, fontSize);
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(this.getContextMenuRedrawViewListLabel());
			item.onClick(() => {
				void this.redrawViewList(leaf);
			});
		});
		menu.addSeparator();
		this.addPlacementMenuItems(menu, current);
	}

	private addFontSizeMenuItems(menu: Menu, current: FontSizeOption): void {
		menu.addItem((item) => {
			item.setTitle(
				current === "m"
					? `✓ ${this.getContextMenuFontSizeDefaultLabel()}`
					: this.getContextMenuFontSizeDefaultLabel()
			);
			item.onClick(() => {
				void this.setFontSize("m");
			});
		});
		menu.addItem((item) => {
			item.setTitle(
				current === "s"
					? `✓ ${this.getContextMenuFontSizeSmallLabel()}`
					: this.getContextMenuFontSizeSmallLabel()
			);
			item.onClick(() => {
				void this.setFontSize("s");
			});
		});
		menu.addItem((item) => {
			item.setTitle(
				current === "xs"
					? `✓ ${this.getContextMenuFontSizeVerySmallLabel()}`
					: this.getContextMenuFontSizeVerySmallLabel()
			);
			item.onClick(() => {
				void this.setFontSize("xs");
			});
		});
	}

	private addPlacementMenuItems(menu: Menu, current: LayoutPlacement): void {
		menu.addItem((item) => {
			item.setTitle(
				current === "left"
					? `✓ ${this.getContextMenuLeftLabel()}`
					: this.getContextMenuLeftLabel()
			);
			item.onClick(() => {
				void this.setPlacement("left");
			});
		});

		menu.addItem((item) => {
			item.setTitle(
				current === "top"
					? `✓ ${this.getContextMenuTopLabel()}`
					: this.getContextMenuTopLabel()
			);
			item.onClick(() => {
				void this.setPlacement("top");
			});
		});
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

		if (state.placement === "left") {
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
		} else {
			if (state.layoutEl.isConnected) {
				state.layoutEl.remove();
			}
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

	private getListAriaLabel(leaf: WorkspaceLeaf): string {
		const file = this.getLeafFile(leaf);
		if (file?.basename && file.basename.trim().length > 0) {
			return file.basename.trim();
		}
		return this.getListLabel();
	}

	private getListLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.title",
			"Views"
		);
	}

	private getContextMenuLeftLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showLeft",
			"Show on left"
		);
	}

	private getContextMenuTopLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showTop",
			"Show on top"
		);
	}

	private getContextMenuEditDescriptionLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.editDescription",
			"Edit description"
		);
	}

	private getContextMenuShowPropertyLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showProperty",
			"Show property"
		);
	}

	private getContextMenuHidePropertyLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideProperty",
			"Hide property"
		);
	}

	private getContextMenuShowNativeToolbarLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.showNativeToolbar",
			"Show native toolbar"
		);
	}

	private getContextMenuHideNativeToolbarLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.hideNativeToolbar",
			"Hide native toolbar"
		);
	}

	private getContextMenuFontSizeDefaultLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeDefault",
			"Font size: Default"
		);
	}

	private getContextMenuFontSizeSmallLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeSmall",
			"Font size: Small"
		);
	}

	private getContextMenuFontSizeVerySmallLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.fontSizeVerySmall",
			"Font size: Very Small"
		);
	}

	private getContextMenuRedrawViewListLabel(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.contextMenu.redrawViewList",
			"Redraw view list"
		);
	}

	private getItemMenuButtonAriaLabel(viewName: string): string {
		return this.translateWithFallbackWithParams(
			"settings.integrations.basesIntegration.viewListSidebar.itemMenuButton.ariaLabel",
			`Open view settings menu for ${viewName}`,
			{ viewName }
		);
	}

	private getNativeViewSettingsOpenFailedNotice(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.notices.nativeViewSettingsOpenFailed",
			"Could not open native view settings."
		);
	}

	private getNativeViewSettingsOpenPartialNotice(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.notices.nativeViewSettingsOpenPartial",
			"Could not open this view's native settings. The native view list is open."
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

	private getEditDescriptionModalTitle(viewName: string): string {
		return this.translateWithFallbackWithParams(
			"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.title",
			`Edit description: ${viewName}`,
			{ viewName }
		);
	}

	private getEditDescriptionModalPlaceholder(description: string | null): string {
		if (description && description.length > 0) {
			return description;
		}
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.placeholder",
			"Enter description"
		);
	}

	private getEditDescriptionModalConfirmText(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.confirm",
			"Save"
		);
	}

	private getEditDescriptionModalCancelText(): string {
		return this.translateWithFallback(
			"settings.integrations.basesIntegration.viewListSidebar.editDescriptionModal.cancel",
			"Cancel"
		);
	}

	private async editViewDescription(leaf: WorkspaceLeaf, entry: ViewEntry): Promise<void> {
		const file = this.getLeafFile(leaf);
		if (!file) return;

		const input = await showTextInputModal(this.plugin.app, {
			title: this.getEditDescriptionModalTitle(entry.name),
			placeholder: this.getEditDescriptionModalPlaceholder(entry.descriptionText),
			initialValue: "",
			confirmText: this.getEditDescriptionModalConfirmText(),
			cancelText: this.getEditDescriptionModalCancelText(),
			allowEmptyResult: true,
		});
		if (input === null) return;

		const nextDescription = input.trim().length > 0 ? input.trim() : null;
		await this.yamlStore.updateViewDescription(file, entry.name, nextDescription);
		this.scheduleRefresh(0);
	}

	private translateWithFallback(key: string, fallback: string): string {
		const text = this.plugin.i18n.translate(key as any);
		if (typeof text !== "string" || text === key) {
			return fallback;
		}
		return text;
	}

	private translateWithFallbackWithParams(
		key: string,
		fallback: string,
		params: Record<string, string | number>
	): string {
		const text = this.plugin.i18n.translate(key as any, params);
		if (typeof text !== "string" || text === key) {
			return fallback;
		}
		return text;
	}

	private getListTitle(leaf: WorkspaceLeaf): string {
		const file = this.getLeafFile(leaf);
		if (file?.basename && file.basename.trim().length > 0) {
			return file.basename.trim();
		}
		return this.getListLabel();
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
		if (state.placement === "top") {
			headerEl.classList.add(CSS_HEADER_TOP);
		}

		const closeButton = doc.createElement("button");
		closeButton.type = "button";
		closeButton.className = `${CSS_CLOSE} ${CSS_CLOSE_SMALL}`;
		closeButton.setAttribute("aria-label", this.getCloseButtonAriaLabel());
		closeButton.setAttribute("title", this.getCloseButtonTooltip());
		setIcon(closeButton, "x");
		closeButton.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.setCollapsed(true);
		});
		headerEl.appendChild(closeButton);

		if (state.placement === "left") {
			const titleEl = doc.createElement("div");
			titleEl.className = CSS_TITLE;
			titleEl.textContent = this.getListTitle(leaf);
			headerEl.appendChild(titleEl);
		}

		listEl.appendChild(headerEl);

		const shouldShowProperty = this.shouldShowProperty();
		const shouldShowIcons = this.shouldShowIcons();
		const shouldForcePropertyLineInTop = state.placement === "top" && shouldShowProperty;
		for (const entry of viewEntries) {
			const rowEl = doc.createElement("div");
			rowEl.className = CSS_ITEM_ROW;
			rowEl.setAttribute("data-view-name", entry.name);

			const button = doc.createElement("button");
			button.type = "button";
			button.className = CSS_ITEM;
			button.setAttribute("data-view-name", entry.name);
			button.setAttribute("aria-label", entry.name);

			const contentEl = doc.createElement("span");
			contentEl.className = CSS_ITEM_CONTENT;

			const nameEl = doc.createElement("span");
			nameEl.className = CSS_ITEM_NAME;
			nameEl.textContent = entry.name;
			contentEl.appendChild(nameEl);

			const hasPropertyText = !!entry.propertyText;
			const shouldRenderProperty =
				shouldShowProperty && (hasPropertyText || shouldForcePropertyLineInTop);
			if (shouldRenderProperty) {
				button.classList.add(CSS_ITEM_WITH_PROPERTY);
				const propertyEl = doc.createElement("span");
				propertyEl.className = CSS_ITEM_PROPERTY;
				if (hasPropertyText) {
					propertyEl.textContent = entry.propertyText;
				} else {
					propertyEl.classList.add(CSS_ITEM_PROPERTY_PLACEHOLDER);
					propertyEl.textContent = "\u00A0";
				}
				contentEl.appendChild(propertyEl);
			}

			if (shouldShowIcons) {
				const iconEl = doc.createElement("span");
				iconEl.className = CSS_ITEM_ICON;
				setIcon(iconEl, entry.icon);
				button.appendChild(iconEl);
			}
			button.appendChild(contentEl);

			if (currentViewName && currentViewName === entry.name) {
				rowEl.classList.add(CSS_ITEM_ACTIVE);
				button.classList.add(CSS_ITEM_ACTIVE);
			}

			button.addEventListener("click", () => {
				this.logViewSettingsDebug("view-row.button.click", {
					viewName: entry.name,
				});
				void this.switchView(leaf, entry.name);
			});

			const itemMenuButtonEl = doc.createElement("button");
			itemMenuButtonEl.type = "button";
			itemMenuButtonEl.className = CSS_ITEM_MENU_BUTTON;
			itemMenuButtonEl.setAttribute("aria-label", this.getItemMenuButtonAriaLabel(entry.name));
			// Keep only Obsidian-style tooltip path via aria-label to avoid duplicated native title tooltip.
			setIcon(itemMenuButtonEl, "more-horizontal");
			let pointerActivatedAt = 0;
			itemMenuButtonEl.addEventListener("pointerenter", () => {
				this.logViewSettingsDebug("item-menu.button.pointerenter", {
					viewName: entry.name,
				});
			});
			itemMenuButtonEl.addEventListener("pointerdown", (evt) => {
				this.logViewSettingsDebug("item-menu.button.pointerdown", {
					viewName: entry.name,
					button: evt.button,
					isTrusted: evt.isTrusted,
					clientX: Math.round(evt.clientX),
					clientY: Math.round(evt.clientY),
				});
				if (evt.button !== 0) return;
				pointerActivatedAt = Date.now();
				evt.preventDefault();
				evt.stopPropagation();
				void this.openNativeViewSettingsFromItemMenu(leaf, entry, itemMenuButtonEl);
			});
			itemMenuButtonEl.addEventListener("click", (evt) => {
				this.logViewSettingsDebug("item-menu.button.click", {
					viewName: entry.name,
					detail: evt.detail,
					button: evt.button,
					isTrusted: evt.isTrusted,
				});
				// Prefer pointerdown path because some startup states drop click.
				if (Date.now() - pointerActivatedAt <= 1200) {
					this.logViewSettingsDebug("item-menu.button.click.suppressed", {
						viewName: entry.name,
						sincePointerDownMs: Date.now() - pointerActivatedAt,
					});
					evt.preventDefault();
					evt.stopPropagation();
					return;
				}
				evt.preventDefault();
				evt.stopPropagation();
				void this.openNativeViewSettingsFromItemMenu(leaf, entry, itemMenuButtonEl);
			});
			itemMenuButtonEl.addEventListener("keydown", (evt) => {
				if (evt.key !== "Enter" && evt.key !== " " && evt.key !== "Spacebar") {
					return;
				}
				this.logViewSettingsDebug("item-menu.button.keydown", {
					viewName: entry.name,
					key: evt.key,
					isTrusted: evt.isTrusted,
				});
				evt.preventDefault();
				evt.stopPropagation();
				void this.openNativeViewSettingsFromItemMenu(leaf, entry, itemMenuButtonEl);
			});
			rowEl.addEventListener("pointerdown", (evt) => {
				const target = evt.target instanceof HTMLElement ? evt.target : null;
				const onMenuButton =
					target?.closest(`.${CSS_ITEM_MENU_BUTTON}`) != null;
				const onMainButton = target?.closest(`.${CSS_ITEM}`) != null;
				this.logViewSettingsDebug("view-row.pointerdown", {
					viewName: entry.name,
					onMenuButton,
					onMainButton,
					targetClass: target?.className ?? null,
					clientX: Math.round(evt.clientX),
					clientY: Math.round(evt.clientY),
				});
			});

			rowEl.appendChild(button);
			rowEl.appendChild(itemMenuButtonEl);
			listEl.appendChild(rowEl);
		}
	}

	private applyAutoShrinkWidthIfEligible(
		leaf: WorkspaceLeaf,
		state: ManagedLeafState,
		viewEntries: ViewEntry[],
		preferredWidth: PreferredWidthResult
	): void {
		if (state.placement !== "left") return;
		if (this.isLeafNarrow(leaf)) return;
		if (this.resizeDrag?.leaf === leaf) return;
		if (preferredWidth.source !== "default") return;
		if (preferredWidth.widthPx !== WIDTH_DEFAULT) return;

		const autoWidth = this.computeAutoShrinkWidthPx(leaf, viewEntries);
		this.applyLayoutWidth(state.layoutEl, autoWidth);
	}

	private computeAutoShrinkWidthPx(leaf: WorkspaceLeaf, viewEntries: ViewEntry[]): number {
		let maxWidth = this.estimateHeaderWidthPx(leaf);
		for (const entry of viewEntries) {
			maxWidth = Math.max(maxWidth, this.estimateItemWidthPx(entry));
		}
		const total = this.clampWidth(Math.ceil(maxWidth + 20));
		if (total >= WIDTH_DEFAULT) return WIDTH_DEFAULT;
		return total;
	}

	private estimateHeaderWidthPx(leaf: WorkspaceLeaf): number {
		const closeWidth = 18;
		const gap = 6;
		const titleWidth = this.estimateVisualTextWidth(this.getListTitle(leaf), false);
		return closeWidth + gap + titleWidth + 8;
	}

	private estimateItemWidthPx(entry: ViewEntry): number {
		const iconWidth = this.shouldShowIcons() ? 16 : 0;
		const gap = this.shouldShowIcons() ? 8 : 0;
		const horizontalPadding = 22;
		const actionSlotWidth = 20;
		const actionGap = 4;
		const nameWidth = this.estimateVisualTextWidth(entry.name, false);
		let textWidth = nameWidth;
		if (this.shouldShowProperty() && entry.propertyText) {
			const propertyWidth = this.estimateVisualTextWidth(entry.propertyText, true) + 12;
			textWidth = Math.max(textWidth, propertyWidth);
		}
		return iconWidth + gap + textWidth + horizontalPadding + actionGap + actionSlotWidth;
	}

	private estimateVisualTextWidth(text: string, isProperty: boolean): number {
		const fontSize = this.getFontSize();
		const baseAscii = fontSize === "xs" ? 5.4 : fontSize === "s" ? 6.2 : 7.2;
		const baseWide = fontSize === "xs" ? 8.8 : fontSize === "s" ? 9.9 : 11.2;
		const propertyScale = isProperty ? 0.92 : 1;

		let width = 0;
		for (const char of text) {
			if (char.trim().length === 0) {
				width += baseAscii * 0.45;
				continue;
			}
			const code = char.codePointAt(0) ?? 0;
			const isWide = code > 0x00ff;
			width += isWide ? baseWide : baseAscii;
		}
		return Math.ceil(width * propertyScale);
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
			const file = this.getLeafFile(leaf);
			if (!file) return fromController;

			const needsYamlProperty =
				this.shouldShowProperty() && fromController.some((entry) => !entry.propertyText);
			const needsYamlDescription = fromController.some((entry) => !entry.descriptionText);
			if (!needsYamlProperty && !needsYamlDescription) {
				return fromController;
			}

			const yamlMetadata = await this.getYamlViewMetadataMap(file);
			if (yamlMetadata.size === 0) return fromController;

			return fromController.map((entry) => {
				const fallback = yamlMetadata.get(entry.name);
				if (!fallback) return entry;
				return {
					...entry,
					type: entry.type ?? fallback.type,
					propertyText: entry.propertyText ?? fallback.propertyText,
					descriptionText: entry.descriptionText ?? fallback.descriptionText,
				};
			});
		}

		const file = this.getLeafFile(leaf);
		if (!file) return [];
		return this.getViewEntriesFromYamlFile(file);
	}

	private async getPreferredWidth(leaf: WorkspaceLeaf): Promise<PreferredWidthResult> {
		const file = this.getLeafFile(leaf);
		if (!file) {
			return {
				widthPx: WIDTH_DEFAULT,
				source: "default",
			};
		}

		const ratio = await this.yamlStore.getViewListSizeRatio(file);
		if (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0) {
			return {
				widthPx: this.clampWidth(WIDTH_DEFAULT * ratio),
				source: "file",
			};
		}

		return {
			widthPx: WIDTH_DEFAULT,
			source: "default",
		};
	}

	private async getViewEntriesFromYamlFile(file: TFile): Promise<ViewEntry[]> {
		const rows = await this.yamlStore.getViews(file);
		if (rows.length === 0) return [];
		const propertyKey = this.getPropertyKey();
		const entries: PartialViewEntry[] = rows.map((row) => {
			const view = row.raw as BasesSubViewLike;
			return {
				name: row.name,
				type: row.type,
				propertyText: this.extractPropertyText(view, propertyKey),
				descriptionText: this.extractPropertyText(view, "description"),
			};
		});
		return this.normalizeViewEntries(entries);
	}

	private async getYamlViewMetadataMap(
		file: TFile
	): Promise<
		Map<
			string,
			{
				type: string | null;
				propertyText: string | null;
				descriptionText: string | null;
			}
		>
	> {
		const rows = await this.yamlStore.getViews(file);
		const map = new Map<
			string,
			{
				type: string | null;
				propertyText: string | null;
				descriptionText: string | null;
			}
		>();
		if (rows.length === 0) return map;

		const propertyKey = this.getPropertyKey();
		for (const row of rows) {
			if (map.has(row.name)) continue;
			const view = row.raw as BasesSubViewLike;
			map.set(row.name, {
				type: row.type,
				propertyText: this.extractPropertyText(view, propertyKey),
				descriptionText: this.extractPropertyText(view, "description"),
			});
		}
		return map;
	}

	private getViewEntriesFromController(controller: BasesControllerLike | null): ViewEntry[] {
		if (!controller) return [];
		const propertyKey = this.getPropertyKey();

		if (Array.isArray(controller.query?.views)) {
			const fromQuery = controller.query.views.map((view): PartialViewEntry => ({
				name: typeof view?.name === "string" ? view.name : "",
				type: typeof view?.type === "string" ? view.type : null,
				propertyText: this.extractPropertyText(view, propertyKey),
				descriptionText: this.extractPropertyText(view, "description"),
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
							.map((name) => ({
								name,
								type: null,
								propertyText: null,
								descriptionText: null,
							}))
					);
				}
			} catch {
				// Ignore and continue fallback chain
			}
		}

		return [];
	}

	private normalizeViewEntries(entries: PartialViewEntry[]): ViewEntry[] {
		const seen = new Set<string>();
		const normalized: ViewEntry[] = [];

		for (const entry of entries) {
			const rawName = typeof entry.name === "string" ? entry.name : "";
			const name = rawName.trim();
			if (!name || seen.has(name)) continue;

			seen.add(name);
			const type =
				typeof entry.type === "string" && entry.type.trim().length > 0
					? entry.type.trim()
					: null;

			normalized.push({
				name,
				type,
				icon: this.resolveViewIcon(type),
				propertyText: this.normalizePropertyText(entry.propertyText),
				descriptionText: this.normalizePropertyText(entry.descriptionText),
			});
		}

		return normalized;
	}

	private extractPropertyText(view: BasesSubViewLike, propertyKey: string): string | null {
		if (!propertyKey) return null;
		let rawValue: unknown;

		if (Object.prototype.hasOwnProperty.call(view, propertyKey)) {
			rawValue = view[propertyKey];
		}

		if (typeof rawValue === "undefined" && typeof view.get === "function") {
			try {
				rawValue = view.get(propertyKey);
			} catch {
				// Ignore getter errors from internal API objects.
			}
		}

		return this.normalizePropertyValue(rawValue);
	}

	private normalizePropertyText(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	private normalizePropertyValue(value: unknown): string | null {
		if (value == null) return null;

		if (Array.isArray(value)) {
			const listValues = value
				.map((item) => this.normalizePropertyValue(item))
				.filter((item): item is string => !!item);
			if (listValues.length === 0) return null;
			return listValues.join(", ");
		}

		if (typeof value === "string") {
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed : null;
		}

		if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
			return String(value);
		}

		if (typeof value === "object") {
			const maybeRecord = value as {
				value?: unknown;
				display?: unknown;
				values?: unknown;
				toArray?: () => unknown;
				toString?: () => string;
			};

			if (typeof maybeRecord.toArray === "function") {
				try {
					return this.normalizePropertyValue(maybeRecord.toArray());
				} catch {
					// Ignore invalid toArray implementations.
				}
			}

			if (typeof maybeRecord.values !== "undefined") {
				const normalizedValues = this.normalizePropertyValue(maybeRecord.values);
				if (normalizedValues) return normalizedValues;
			}

			if (typeof maybeRecord.display !== "undefined") {
				const normalizedDisplay = this.normalizePropertyValue(maybeRecord.display);
				if (normalizedDisplay) return normalizedDisplay;
			}

			if (typeof maybeRecord.value !== "undefined") {
				const normalizedInnerValue = this.normalizePropertyValue(maybeRecord.value);
				if (normalizedInnerValue) return normalizedInnerValue;
			}

			try {
				const text = String(value).trim();
				if (text && text !== "[object Object]") {
					return text;
				}
			} catch {
				return null;
			}
		}

		return null;
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

	private async setPlacement(placement: LayoutPlacement): Promise<void> {
		if (this.getPlacement() === placement) return;
		this.plugin.settings.basesViewListPlacement = placement;
		this.scheduleRefresh(0);
		await this.persistSettings();
	}

	private async setShowProperty(show: boolean): Promise<void> {
		if (this.plugin.settings.basesViewListShowProperty === show) return;
		this.plugin.settings.basesViewListShowProperty = show;
		this.scheduleRefresh(0);
		await this.persistSettings();
	}

	private async setShowNativeToolbar(show: boolean): Promise<void> {
		if (this.plugin.settings.basesViewListShowNativeToolbar === show) return;
		this.plugin.settings.basesViewListShowNativeToolbar = show;
		this.scheduleRefresh(0);
		await this.persistSettings();
	}

	private async setFontSize(fontSize: FontSizeOption): Promise<void> {
		if (this.getFontSize() === fontSize) return;
		this.plugin.settings.basesViewListFontSize = fontSize;
		this.scheduleRefresh(0);
		await this.persistSettings();
	}

	private async redrawViewList(leaf: WorkspaceLeaf): Promise<void> {
		if (!this.running) return;
		this.cleanupLeaf(leaf);
		this.removeToolbarOpenTrigger(leaf);
		await this.refreshLeaf(leaf);
	}

	private async persistWidthForLeaf(leaf: WorkspaceLeaf, widthPx: number): Promise<void> {
		const clampedWidth = this.clampWidth(widthPx);
		const file = this.getLeafFile(leaf);
		if (!file) return;

		const ratio = clampedWidth === WIDTH_DEFAULT ? null : this.roundRatio(clampedWidth / WIDTH_DEFAULT);
		await this.yamlStore.setViewListSizeRatio(file, ratio);
	}

	private roundRatio(value: number): number {
		return Math.round(value * 1000) / 1000;
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

	private async waitForNativeToolbarLayoutReady(rootEl: HTMLElement): Promise<void> {
		const wait = (ms: number) =>
			new Promise<void>((resolve) => {
				window.setTimeout(resolve, ms);
			});
		const maxAttempts = 20;
		const originThresholdPx = 2;
		const stableDeltaPx = 2;
		const stableFramesRequired = 3;
		let stableFrames = 0;
		let previousRect:
			| { left: number; top: number; width: number; height: number }
			| null = null;

		for (let i = 0; i < maxAttempts; i += 1) {
			const triggerHost = rootEl.querySelector<HTMLElement>(".bases-toolbar-views-menu");
			const rect = triggerHost?.getBoundingClientRect();
			const left = rect?.left ?? Number.NaN;
			const top = rect?.top ?? Number.NaN;
			const width = rect?.width ?? 0;
			const height = rect?.height ?? 0;
			const isConnected = !!triggerHost?.isConnected;
			const hasSize = width > 0 && height > 0;
			const hasFinitePosition = Number.isFinite(left) && Number.isFinite(top);
			const isAwayFromOrigin =
				hasFinitePosition && left > originThresholdPx && top > originThresholdPx;
			const hasBasicLayout = isConnected && hasSize && isAwayFromOrigin;

			let isStable = false;
			if (hasBasicLayout) {
				if (previousRect) {
					const deltaLeft = Math.abs(left - previousRect.left);
					const deltaTop = Math.abs(top - previousRect.top);
					const deltaWidth = Math.abs(width - previousRect.width);
					const deltaHeight = Math.abs(height - previousRect.height);
					isStable =
						deltaLeft <= stableDeltaPx &&
						deltaTop <= stableDeltaPx &&
						deltaWidth <= stableDeltaPx &&
						deltaHeight <= stableDeltaPx;
				}

				stableFrames = isStable ? stableFrames + 1 : 1;
				previousRect = { left, top, width, height };
			} else {
				stableFrames = 0;
				previousRect = null;
			}

			const hasLayout = hasBasicLayout && stableFrames >= stableFramesRequired;
			this.logViewSettingsDebug("item-menu.open.wait-native-toolbar-layout", {
				attempt: i + 1,
				maxAttempts,
				hasTrigger: !!triggerHost,
				isConnected,
				width: rect ? Math.round(width) : null,
				height: rect ? Math.round(height) : null,
				left: rect ? Math.round(left) : null,
				top: rect ? Math.round(top) : null,
				isAwayFromOrigin,
				isStable,
				stableFrames,
				stableFramesRequired,
				hasLayout,
			});
			if (hasLayout) return;
			await wait(16);
		}
	}
}
