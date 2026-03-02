import { Keymap, Menu, Notice, TFile, setIcon } from "obsidian";
import BaseViewsPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { calculateSummary, getSummaryOptions, TableSummaryKey } from "./tableSummary";
import { VirtualScroller } from "../utils/VirtualScroller";
import {
	CUSTOM_TABLE_VIRTUAL_OVERSCAN,
	CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED,
	flattenGroupedVirtualItems,
	GroupedVirtualSource,
	hasAnyTableSummary,
	shouldUseGroupedVirtualization,
	shouldUseUngroupedVirtualization,
	VirtualGroupedItem,
} from "./customTableVirtualization";
import {
	buildColumnTemplateFromWidths,
	calcTotalColumnWidth,
	ColumnSizeMap,
	DEFAULT_TABLE_COLUMN_WIDTH,
	MIN_TABLE_COLUMN_WIDTH,
	normalizeColumnSizeMap,
	resolveColumnWidths,
	setColumnSizeValue,
} from "./tableColumnSizing";
import {
	GroupSortDirection,
	groupEntriesByValue,
	hasAnyMultiValueEntries,
	sortGroupedEntries,
} from "./customTableGrouping";
import {
	buildDuplicateNavigationIndex,
	createEmptyDuplicateNavigationIndex,
	getNextDuplicateRowOrder,
	hasDuplicateNavigationTarget,
	type DuplicateNavigationIndex,
} from "./customTableDuplicateNavigation";
import { formatGroupTitleWithProperty } from "./customTableDisplayUtils";
import { resolveIconicFileIcon } from "../integrations/iconic/iconicFileIconResolver";
import {
	normalizeViewBgColorValue,
	pickReadableTextColor,
	resolveThemeMode,
	resolveViewColorToRgb,
	tintCustomViewBackgroundColor,
	toCssRgb,
} from "./viewColorUtils";

// Custom Tableの行高設定で利用する選択肢を表す。
type RowHeightOption = "veryShort" | "short" | "medium" | "tall" | "extraTall";
// Custom Tableの仮想化モード状態を表す。
type VirtualMode = "none" | "ungrouped" | "grouped";

const VALID_ROW_HEIGHTS: RowHeightOption[] = [
	"veryShort",
	"short",
	"medium",
	"tall",
	"extraTall",
];
const LUCIDE_PREFIX = "lucide-";

// Custom Table描画で扱う最小限のentry参照型を表す。
type EntryLike = {
	file?: {
		path?: string;
		name?: string;
	};
	getValue: (propertyId: string) => any;
};

// 1段グルーピング描画用のグループ情報を表す。
interface RenderableGroup {
	id: string;
	title: string;
	entries: EntryLike[];
}

// 2段グルーピング描画用の親グループ情報を表す。
interface RenderableNestedGroup {
	id: string;
	title: string;
	entries: EntryLike[];
	subGroups: RenderableGroup[];
}

// 2段グルーピング仮想描画で使う行種別Unionを表す。
type VirtualNestedGroupedItem =
	| {
		type: "primary-header";
		id: string;
		title: string;
		count: number;
	}
	| {
		type: "secondary-header";
		id: string;
		title: string;
		count: number;
	}
	| {
		type: "group-summary";
		id: string;
		summaryValues: Record<string, string>;
		nested?: boolean;
	}
	| {
		type: "row";
		id: string;
		entry: EntryLike;
		rowOrder: number;
		nested?: boolean;
	};

// プロパティアイコン解決に必要な最小メタデータ型を表す。
interface PropertyMetadataLike {
	icon?: unknown;
	type?: unknown;
	widget?: unknown;
}

const PROPERTY_TYPE_ICON_MAP: Record<string, string> = {
	checkbox: "check-square",
	boolean: "check-square",
	date: "calendar",
	datetime: "calendar-clock",
	time: "clock",
	status: "circle",
	link: "link-2",
	url: "link-2",
	file: "file-text",
	related: "link-2",
	relation: "link-2",
	formula: "table-cells-merge",
};

// Basesの全entryを表形式で描画する tasknotesCustomTable ビュー本体。
export class CustomTableView extends BasesViewBase {
	type = "tasknotesCustomTable";

	private tableScrollEl: HTMLElement | null = null;
	private rowHeight: RowHeightOption = "medium";
	private tableSummaries: Record<string, TableSummaryKey> = {};
	private columnSize: ColumnSizeMap = {};
	private configLoaded = false;
	private hasHandledFirstDataUpdate = false;
	private lastViewConfigSignature = "";
	private readonly NORMAL_UPDATE_DEBOUNCE_MS = 120;

	private virtualScroller: VirtualScroller<any> | null = null;
	private useVirtualScrolling = false;
	private virtualMode: VirtualMode = "none";
	private virtualColumnsKey = "";
	private virtualItemsHostEl: HTMLElement | null = null;
	private virtualHeaderRowEl: HTMLElement | null = null;
	private virtualFooterRowEl: HTMLElement | null = null;
	private virtualContainerEl: HTMLElement | null = null;
	private virtualMenuEntries: EntryLike[] = [];
	private virtualColumnTemplate = "";
	private virtualMinWidth = "";
	private renderedTables: HTMLTableElement[] = [];
	private activeColumnResizeCleanup: (() => void) | null = null;
	private basesController: any = null;
	private duplicateNavigationIndex: DuplicateNavigationIndex = createEmptyDuplicateNavigationIndex();
	private normalRowOrderCursor = 0;
	private virtualRowOrderToIndex = new Map<number, number>();
	private subGroupPropertyId: string | null = null;
	private unnestMultiValueGroup = true;
	private showIconicIconInNameColumn = true;
	private showGroupingPropertyName = false;
	private viewSwitchObserver: MutationObserver | null = null;
	private lastObservedViewName: string | null = null;

	private readonly DEFAULT_COLUMN_WIDTH = DEFAULT_TABLE_COLUMN_WIDTH;
	private readonly MIN_COLUMN_WIDTH = MIN_TABLE_COLUMN_WIDTH;
	private readonly DUPLICATE_JUMP_SCROLL_DURATION_MS = 150;

	private readonly VIRTUAL_THRESHOLD_UNGROUPED = CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED;
	// Keep grouped layout consistent (single shared header) regardless row count.
	private readonly VIRTUAL_THRESHOLD_GROUPED = 0;
	private readonly VIRTUAL_OVERSCAN = CUSTOM_TABLE_VIRTUAL_OVERSCAN;
	private duplicateJumpAnimationRAF: number | null = null;
	private jumpHighlightRowOrder: number | null = null;
	private jumpHighlightRowEl: HTMLElement | null = null;
	private jumpHighlightFindRAF: number | null = null;
	private jumpHighlightUnlockRAF: number | null = null;
	private jumpHighlightScheduleTimer: number | null = null;
	private jumpHighlightCanClear = true;

	constructor(controller: any, containerEl: HTMLElement, plugin: BaseViewsPlugin) {
		super(controller, containerEl, plugin);
		(this.dataAdapter as any).basesView = this;
		this.basesController = controller;
	}

	onload(): void {
		this.readViewOptions();
		super.onload();
		this.register(() => this.destroyVirtualScroller());
		this.register(() => this.stopActiveColumnResize());
		this.register(() => this.stopDuplicateJumpAnimation());
		this.register(() => {
			this.clearJumpTargetHighlight();
			this.stopJumpHighlightTimers();
		});
		this.register(() => {
			this.viewSwitchObserver?.disconnect();
			this.viewSwitchObserver = null;
			this.lastObservedViewName = null;
			this.clearActiveViewBgColor();
		});
	}

	/**
	 * Optimize update timing:
	 * - First data update: render immediately.
	 * - View config changes (sort/order/group/options): render immediately.
	 * - Regular data churn: short debounce to avoid excessive rerenders.
	 */
	onDataUpdated(): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		if (!this.rootElement?.isConnected) {
			return;
		}

		const currentSignature = this.buildViewConfigSignature();
		const configChanged = currentSignature !== this.lastViewConfigSignature;
		this.lastViewConfigSignature = currentSignature;

		const shouldRenderImmediately = !this.hasHandledFirstDataUpdate || configChanged;
		const delay = shouldRenderImmediately ? 0 : this.NORMAL_UPDATE_DEBOUNCE_MS;

		if (this.dataUpdateDebounceTimer) {
			clearTimeout(this.dataUpdateDebounceTimer);
		}

		const win = this.containerEl.ownerDocument.defaultView || window;
		this.dataUpdateDebounceTimer = win.setTimeout(() => {
			this.dataUpdateDebounceTimer = null;
			this.hasHandledFirstDataUpdate = true;
			try {
				this.render();
			} catch (error) {
				console.error(`[BaseViews][${this.type}] Render error:`, error);
				this.renderError(error as Error);
			}
		}, delay);
	}

	private buildViewConfigSignature(): string {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		try {
			const order = JSON.stringify(this.config?.getOrder?.() ?? []);
			const sort = JSON.stringify(this.config?.getSort?.() ?? []);
			const rowHeight = String(this.config?.get?.("rowHeight") ?? "medium");
			const summaries = JSON.stringify(this.config?.get?.("tableSummaries") ?? {});
			const columnSize = JSON.stringify(this.config?.get?.("columnSize") ?? {});
			const subGroup = String(this.config?.getAsPropertyId?.("subGroup") ?? "");
			const unnest = String(this.config?.get?.("unnestMultiValueGroup") ?? true);
			const grouped = this.dataAdapter.isGrouped() ? "grouped" : "flat";
			const allowControllerGroupByFallback = grouped === "grouped";
			const primaryGroupBy = this.getPrimaryGroupByPropertyId(allowControllerGroupByFallback) ?? "";
			const primaryGroupDirection = this.getPrimaryGroupByDirection(allowControllerGroupByFallback);
			const iconic = String(this.plugin.settings?.customTableShowIconicIconInNameColumn ?? true);
			const showGroupProperty = String(
				this.plugin.settings?.customTableShowGroupingPropertyName ?? false
			);
			const activeViewName = this.getCurrentControllerViewName() ?? "";
			return `${order}|${sort}|${rowHeight}|${summaries}|${columnSize}|${subGroup}|${unnest}|${primaryGroupBy}|${primaryGroupDirection}|${grouped}|${iconic}|${showGroupProperty}|${activeViewName}`;
		} catch {
			return "";
		}
	}

	protected setupContainer(): void {
		super.setupContainer();

		if (!this.rootElement) return;
		this.rootElement.classList.add("bv-bases-custom-table-view");
		this.rootElement.style.cssText = "display: flex; flex-direction: column; height: 100%;";

		const doc = this.containerEl.ownerDocument;
		this.tableScrollEl = doc.createElement("div");
		this.tableScrollEl.className = "bv-bases-table-scroll";
		this.registerDomEvent(this.tableScrollEl, "pointerover", this.handleTablePointerOver);
		this.rootElement.appendChild(this.tableScrollEl);
		this.setupViewSwitchObserver();
	}

	private getCurrentControllerViewName(): string | null {
		const controller = this.basesController;
		const rawViewName = controller?.viewName;
		if (typeof rawViewName === "string" && rawViewName.trim().length > 0) {
			return rawViewName.trim();
		}

		const labelEl = this.containerEl
			.closest(".bases-view")
			?.parentElement
			?.querySelector<HTMLElement>(".bases-toolbar-views-menu .text-button-label");
		const text = labelEl?.textContent?.trim();
		return text || null;
	}

	private getCurrentControllerViewDefinition(): any | null {
		const controller = this.basesController;
		const currentViewName = this.getCurrentControllerViewName();
		if (!currentViewName) return null;

		const views = controller?.query?.views;
		if (!Array.isArray(views)) return null;

		for (const view of views) {
			if (!view || typeof view !== "object") continue;
			const name = typeof view.name === "string" ? view.name.trim() : "";
			if (name === currentViewName) {
				return view;
			}
		}
		return null;
	}

	private extractCurrentViewBgColor(): string | null {
		const view = this.getCurrentControllerViewDefinition();
		if (!view || typeof view !== "object") return null;

		let rawValue: unknown;
		if (Object.prototype.hasOwnProperty.call(view, "bg-color")) {
			rawValue = (view as Record<string, unknown>)["bg-color"];
		}
		const getter = (view as { get?: (key: string) => unknown }).get;
		if (typeof rawValue === "undefined" && typeof getter === "function") {
			try {
				rawValue = getter.call(view, "bg-color");
			} catch {
				// Ignore getter errors from internal API objects.
			}
		}

		return normalizeViewBgColorValue(rawValue);
	}

	private applyActiveViewBgColor(): void {
		if (!this.rootElement) return;

		const rawBgColor = this.extractCurrentViewBgColor();
		const doc = this.containerEl.ownerDocument;
		const baseColor = resolveViewColorToRgb(rawBgColor, {
			doc,
			scopeEl: this.rootElement,
		});
		if (!baseColor) {
			this.clearActiveViewBgColor();
			return;
		}

		const mode = resolveThemeMode(doc);
		const backgroundColor = tintCustomViewBackgroundColor(baseColor, mode);
		const textColor = pickReadableTextColor(backgroundColor);

		this.rootElement.classList.add("bv-custom-view-has-bg");
		this.rootElement.style.setProperty("--bv-custom-view-bg", toCssRgb(backgroundColor));
		this.rootElement.style.setProperty("--bv-custom-view-fg", toCssRgb(textColor));
	}

	private clearActiveViewBgColor(): void {
		if (!this.rootElement) return;
		this.rootElement.classList.remove("bv-custom-view-has-bg");
		this.rootElement.style.removeProperty("--bv-custom-view-bg");
		this.rootElement.style.removeProperty("--bv-custom-view-fg");
	}

	private setupViewSwitchObserver(): void {
		this.viewSwitchObserver?.disconnect();
		this.viewSwitchObserver = null;

		const labelEl = this.containerEl
			.closest(".bases-view")
			?.parentElement
			?.querySelector<HTMLElement>(".bases-toolbar-views-menu .text-button-label");
		if (!labelEl) return;

		this.lastObservedViewName = this.getCurrentControllerViewName();
		this.viewSwitchObserver = new MutationObserver(() => {
			const currentViewName = this.getCurrentControllerViewName();
			if (currentViewName === this.lastObservedViewName) return;
			this.lastObservedViewName = currentViewName;
			this.debouncedRefresh();
		});
		this.viewSwitchObserver.observe(labelEl, {
			characterData: true,
			childList: true,
			subtree: true,
		});
	}

	private readViewOptions(): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		if (!this.config || typeof this.config.get !== "function") return;

		try {
			const rowHeightValue = this.config.get("rowHeight");
			if (typeof rowHeightValue === "string" && VALID_ROW_HEIGHTS.includes(rowHeightValue as RowHeightOption)) {
				this.rowHeight = rowHeightValue as RowHeightOption;
			} else {
				this.rowHeight = "medium";
			}

			const summariesValue = this.config.get("tableSummaries");
			if (summariesValue && typeof summariesValue === "object") {
				const next: Record<string, TableSummaryKey> = {};
				for (const [propertyId, key] of Object.entries(summariesValue as Record<string, unknown>)) {
					if (typeof key === "string") {
						next[propertyId] = key as TableSummaryKey;
					}
				}
				this.tableSummaries = next;
			} else {
				this.tableSummaries = {};
			}

			this.columnSize = normalizeColumnSizeMap(
				this.config.get("columnSize"),
				this.MIN_COLUMN_WIDTH
			);

			const subGroupValue = this.config.getAsPropertyId?.("subGroup");
			this.subGroupPropertyId =
				typeof subGroupValue === "string" && subGroupValue.trim().length > 0
					? subGroupValue.trim()
					: null;

			const unnestValue = this.config.get("unnestMultiValueGroup");
			this.unnestMultiValueGroup = unnestValue !== false;
			this.showIconicIconInNameColumn =
				this.plugin.settings?.customTableShowIconicIconInNameColumn !== false;
			this.showGroupingPropertyName =
				this.plugin.settings?.customTableShowGroupingPropertyName === true;

			this.configLoaded = true;
		} catch (error) {
			console.warn("[BaseViews][CustomTableView] Failed to read view options:", error);
			this.rowHeight = "medium";
			this.tableSummaries = {};
			this.columnSize = {};
			this.subGroupPropertyId = null;
			this.unnestMultiValueGroup = true;
			this.showIconicIconInNameColumn = true;
			this.showGroupingPropertyName = false;
		}
	}

	private applyRowHeightClass(): void {
		if (!this.rootElement) return;
		for (const option of VALID_ROW_HEIGHTS) {
			this.rootElement.classList.remove(`bv-bases-table-row-height-${option}`);
		}
		this.rootElement.classList.add(`bv-bases-table-row-height-${this.rowHeight}`);
	}

	private getVisibleColumns(): string[] {
		const order = this.config?.getOrder?.() || [];
		if (Array.isArray(order) && order.length > 0) {
			return [...order];
		}

		if (Array.isArray(this.data?.properties) && this.data.properties.length > 0) {
			return [...this.data.properties];
		}

		return ["file.name"];
	}

	async render(): Promise<void> {
		// 描画要素の組み立てと状態反映をまとめて行い、再描画処理を一元化する。
		if (!this.tableScrollEl) return;

		if (!this.configLoaded && this.config) {
			this.readViewOptions();
		}
		if (this.config) {
			// Reflect runtime changes when users tweak view options.
			this.readViewOptions();
		}

		this.applyActiveViewBgColor();
		this.applyRowHeightClass();
		this.resetRowNavigationState();

		const columns = this.getVisibleColumns();
		if (columns.length === 0) {
			this.clearRenderedContent();
			this.renderEmptyState("No properties selected for this view.");
			return;
		}

		const groupedData = this.data?.groupedData || [];
		const allEntries = this.getAllEntries(groupedData);
		if (allEntries.length === 0 && groupedData.length === 0) {
			this.clearRenderedContent();
			this.renderEmptyState("No rows match the current filters.");
			return;
		}
		const isGrouped = this.dataAdapter.isGrouped();
		const primaryGroupByPropertyId = this.getPrimaryGroupByPropertyId(isGrouped);
		const primaryGroupSortDirection = this.getPrimaryGroupByDirection(isGrouped);
		const shouldRenderGrouped =
			isGrouped || !!primaryGroupByPropertyId || !!this.subGroupPropertyId;

		if (shouldRenderGrouped) {
			const nestedGroups = this.buildRenderableNestedGroups(
				groupedData,
				allEntries,
				isGrouped,
				primaryGroupByPropertyId,
				primaryGroupSortDirection
			);
			if (nestedGroups.length === 0) {
				this.clearRenderedContent();
				this.renderEmptyState("No rows match the current filters.");
				return;
			}

			this.prepareDuplicateNavigation(this.collectNestedGroupRowEntries(nestedGroups));
			const enhancedItems = this.flattenNestedGroupsForVirtual(nestedGroups, columns);
			const shouldVirtual = shouldUseGroupedVirtualization(
				enhancedItems.length,
				this.VIRTUAL_THRESHOLD_GROUPED
			);

			if (shouldVirtual) {
				await this.renderNestedGroupedVirtual(enhancedItems, columns, allEntries);
			} else {
				this.renderNestedGroupedNormal(nestedGroups, columns);
			}
			return;
		}

		const entries = allEntries as EntryLike[];
		if (entries.length === 0) {
			this.clearRenderedContent();
			this.renderEmptyState("No rows match the current filters.");
			return;
		}
		this.prepareDuplicateNavigation(entries);

		const shouldVirtual = shouldUseUngroupedVirtualization(
			entries.length,
			this.VIRTUAL_THRESHOLD_UNGROUPED
		);

		if (shouldVirtual) {
			await this.renderUngroupedVirtual(entries, columns);
		} else {
			this.renderUngroupedNormal(entries, columns);
		}
	}

	private getAllEntries(groupedData: any[]): EntryLike[] {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const directEntries = (this.data?.data || []) as EntryLike[];
		if (directEntries.length > 0) {
			return directEntries;
		}

		if (!Array.isArray(groupedData) || groupedData.length === 0) {
			return [];
		}

		const result: EntryLike[] = [];
		const seenPaths = new Set<string>();
		const seenEntries = new Set<EntryLike>();

		for (const group of groupedData) {
			const entries = (group?.entries || []) as EntryLike[];
			for (const entry of entries) {
				const path = entry?.file?.path;
				if (typeof path === "string" && path.length > 0) {
					if (seenPaths.has(path)) continue;
					seenPaths.add(path);
					result.push(entry);
					continue;
				}
				if (seenEntries.has(entry)) continue;
				seenEntries.add(entry);
				result.push(entry);
			}
		}

		return result;
	}

	private clearRenderedContent(): void {
		this.stopActiveColumnResize();
		this.destroyVirtualScroller();
		this.renderedTables = [];
		this.tableScrollEl?.empty();
		this.resetRowNavigationState();
	}

	private resetRowNavigationState(): void {
		this.duplicateNavigationIndex = createEmptyDuplicateNavigationIndex();
		this.normalRowOrderCursor = 0;
		this.virtualRowOrderToIndex.clear();
		this.clearJumpTargetHighlight();
		this.stopJumpHighlightTimers();
	}

	private prepareDuplicateNavigation(entriesInRenderOrder: EntryLike[]): void {
		this.duplicateNavigationIndex = buildDuplicateNavigationIndex(
			entriesInRenderOrder.map((entry) => entry?.file?.path)
		);
		this.normalRowOrderCursor = 0;
		this.virtualRowOrderToIndex.clear();
	}

	private collectNestedGroupRowEntries(nestedGroups: RenderableNestedGroup[]): EntryLike[] {
		const entries: EntryLike[] = [];
		for (const primary of nestedGroups) {
			if (primary.subGroups.length > 0) {
				for (const subGroup of primary.subGroups) {
					entries.push(...subGroup.entries);
				}
				continue;
			}
			entries.push(...primary.entries);
		}
		return entries;
	}

	private consumeNormalRowOrder(): number {
		const rowOrder = this.normalRowOrderCursor;
		this.normalRowOrderCursor += 1;
		return rowOrder;
	}

	private handleTablePointerOver = (event: PointerEvent): void => {
		if (!this.jumpHighlightCanClear) return;
		if (this.jumpHighlightRowOrder == null) return;

		const target = event.target;
		if (!(target instanceof HTMLElement)) return;

		const hoveredRow = target.closest<HTMLElement>(".bv-bases-table-row[data-tn-row-order]");
		if (!hoveredRow) return;

		const hoveredOrderRaw = hoveredRow.dataset.tnRowOrder;
		if (typeof hoveredOrderRaw !== "string") return;
		const hoveredOrder = Number.parseInt(hoveredOrderRaw, 10);
		if (!Number.isFinite(hoveredOrder)) return;
		if (hoveredOrder === this.jumpHighlightRowOrder) return;

		this.clearJumpTargetHighlight();
	};

	private findRenderedRowByOrder(rowOrder: number): HTMLElement | null {
		return this.rootElement?.querySelector<HTMLElement>(
			`.bv-bases-table-row[data-tn-row-order="${rowOrder}"]`
		) ?? null;
	}

	private applyJumpTargetHighlight(rowOrder: number): void {
		// 条件分岐に応じて状態更新と副作用処理を段階的に適用する。
		this.clearJumpTargetHighlight();
		this.stopJumpHighlightTimers();

		const maxFindAttempts = 24;
		let attempts = 0;
		const win = this.containerEl.ownerDocument.defaultView || window;
		const tryApply = (): void => {
			const rowEl = this.findRenderedRowByOrder(rowOrder);
			if (!rowEl) {
				if (attempts < maxFindAttempts) {
					attempts += 1;
					this.jumpHighlightFindRAF = win.requestAnimationFrame(tryApply);
				}
				return;
			}

			this.jumpHighlightFindRAF = null;
			this.jumpHighlightRowEl = rowEl;
			this.jumpHighlightRowOrder = rowOrder;
			rowEl.classList.add("bv-bases-table-row--jump-target");

			// Allow one frame where both hover and jump target highlight can coexist.
			this.jumpHighlightCanClear = false;
			this.jumpHighlightUnlockRAF = win.requestAnimationFrame(() => {
				this.jumpHighlightUnlockRAF = null;
				this.jumpHighlightCanClear = true;
			});
		};

		tryApply();
	}

	private scheduleJumpTargetHighlight(rowOrder: number): void {
		this.clearJumpTargetHighlight();
		this.stopJumpHighlightTimers();

		const win = this.containerEl.ownerDocument.defaultView || window;
		this.jumpHighlightScheduleTimer = win.setTimeout(() => {
			this.jumpHighlightScheduleTimer = null;
			this.applyJumpTargetHighlight(rowOrder);
		}, this.DUPLICATE_JUMP_SCROLL_DURATION_MS);
	}

	private clearJumpTargetHighlight(): void {
		if (this.jumpHighlightRowEl?.isConnected) {
			this.jumpHighlightRowEl.classList.remove("bv-bases-table-row--jump-target");
		}
		this.jumpHighlightRowEl = null;
		this.jumpHighlightRowOrder = null;
	}

	private stopJumpHighlightTimers(): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const win = this.containerEl.ownerDocument.defaultView || window;
		if (this.jumpHighlightFindRAF !== null) {
			win.cancelAnimationFrame(this.jumpHighlightFindRAF);
			this.jumpHighlightFindRAF = null;
		}
		if (this.jumpHighlightUnlockRAF !== null) {
			win.cancelAnimationFrame(this.jumpHighlightUnlockRAF);
			this.jumpHighlightUnlockRAF = null;
		}
		if (this.jumpHighlightScheduleTimer !== null) {
			win.clearTimeout(this.jumpHighlightScheduleTimer);
			this.jumpHighlightScheduleTimer = null;
		}
		this.jumpHighlightCanClear = true;
	}

	private readPrimaryGroupByFromConfig(): {
		resolved: boolean;
		propertyId: string | null;
		direction: GroupSortDirection | null;
	} {
		if (!this.config) {
			return { resolved: false, propertyId: null, direction: null };
		}

		try {
			const getAsPropertyId = this.config.getAsPropertyId;
			if (typeof getAsPropertyId === "function") {
				const propertyCandidate = getAsPropertyId.call(this.config, "groupBy");
				const propertyId = this.asNonEmptyString(propertyCandidate);
				if (propertyCandidate == null || typeof propertyCandidate === "string") {
					const rawGroupBy =
						typeof this.config.get === "function" ? this.config.get("groupBy") : null;
					const propertyFromRaw = this.resolveGroupByPropertyFromValue(rawGroupBy);
					const direction = this.resolveGroupByDirectionFromValue(
						rawGroupBy
					);
					return { resolved: true, propertyId: propertyId ?? propertyFromRaw, direction };
				}
			}

			const getOption = this.config.get;
			if (typeof getOption === "function") {
				const rawGroupBy = getOption.call(this.config, "groupBy");
				const propertyId = this.resolveGroupByPropertyFromValue(rawGroupBy);
				const direction = this.resolveGroupByDirectionFromValue(rawGroupBy);
				return { resolved: true, propertyId, direction };
			}
		} catch {
			return { resolved: false, propertyId: null, direction: null };
		}

		return { resolved: false, propertyId: null, direction: null };
	}

	private resolveGroupByPropertyFromValue(rawGroupBy: unknown): string | null {
		if (typeof rawGroupBy === "string") {
			return this.asNonEmptyString(rawGroupBy);
		}
		if (rawGroupBy && typeof rawGroupBy === "object") {
			const propertyCandidate = (rawGroupBy as { property?: unknown }).property;
			return this.asNonEmptyString(propertyCandidate);
		}
		return null;
	}

	private resolveGroupByDirectionFromValue(rawGroupBy: unknown): GroupSortDirection | null {
		if (!rawGroupBy || typeof rawGroupBy !== "object") return null;
		const directionCandidate = (rawGroupBy as { direction?: unknown }).direction;
		if (typeof directionCandidate !== "string") return null;
		const normalized = directionCandidate.trim().toUpperCase();
		if (normalized === "DESC") return "DESC";
		if (normalized === "ASC") return "ASC";
		return null;
	}

	private getPrimaryGroupByPropertyId(allowControllerFallback = true): string | null {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const configGroupBy = this.readPrimaryGroupByFromConfig();
		if (configGroupBy.propertyId) return configGroupBy.propertyId;
		if (!allowControllerFallback) return null;

		const controller = this.basesController;
		if (!controller?.query?.views || !controller?.viewName) return null;

		const views = controller.query.views;
		if (!Array.isArray(views)) return null;
		const currentViewName = controller.viewName;
		for (const view of views) {
			if (!view || view.name !== currentViewName) continue;
			const groupBy = view.groupBy;
			if (!groupBy) return null;
			if (typeof groupBy === "string") return groupBy;
			if (typeof groupBy === "object" && typeof groupBy.property === "string") {
				return groupBy.property;
			}
			return null;
		}

		return null;
	}

	private getPrimaryGroupByDirection(allowControllerFallback = true): GroupSortDirection {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const configGroupBy = this.readPrimaryGroupByFromConfig();
		if (configGroupBy.direction) return configGroupBy.direction;
		if (!allowControllerFallback) return "ASC";

		const controller = this.basesController;
		if (!controller?.query?.views || !controller?.viewName) return "ASC";

		const views = controller.query.views;
		if (!Array.isArray(views)) return "ASC";
		const currentViewName = controller.viewName;
		for (const view of views) {
			if (!view || view.name !== currentViewName) continue;
			const groupBy = view.groupBy;
			if (typeof groupBy === "object" && typeof groupBy.direction === "string") {
				const normalized = groupBy.direction.toUpperCase();
				if (normalized === "DESC") return "DESC";
			}
			return "ASC";
		}
		return "ASC";
	}

	private buildRenderableNestedGroups(
		groupedData: any[],
		allEntries: EntryLike[],
		isGrouped: boolean,
		primaryGroupByPropertyId: string | null,
		primaryGroupSortDirection: GroupSortDirection
	): RenderableNestedGroup[] {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const hasPrimaryGroupBy = typeof primaryGroupByPropertyId === "string" && primaryGroupByPropertyId.length > 0;
		const canUnnestPrimary =
			this.unnestMultiValueGroup &&
			hasPrimaryGroupBy &&
			hasAnyMultiValueEntries(allEntries, (entry) => this.safeGetValue(entry, primaryGroupByPropertyId!));
		const useSubGroupAsPrimary =
			!hasPrimaryGroupBy && !isGrouped && typeof this.subGroupPropertyId === "string" && this.subGroupPropertyId.length > 0;

		let primaryGroups: RenderableGroup[] = [];

		if (useSubGroupAsPrimary) {
			primaryGroups = this.buildGroupsFromProperty(
				allEntries,
				this.subGroupPropertyId!,
				this.unnestMultiValueGroup,
				primaryGroupSortDirection
			);
		} else if (hasPrimaryGroupBy) {
			if (!canUnnestPrimary && isGrouped) {
				primaryGroups = this.extractRenderableGroups(
					groupedData,
					primaryGroupSortDirection,
					primaryGroupByPropertyId
				);
			} else {
				primaryGroups = this.buildGroupsFromProperty(
					allEntries,
					primaryGroupByPropertyId!,
					this.unnestMultiValueGroup,
					primaryGroupSortDirection
				);
			}
		} else if (isGrouped) {
			primaryGroups = this.extractRenderableGroups(groupedData, primaryGroupSortDirection, null);
		} else {
			primaryGroups = [
				{
					id: "all",
					title: "All",
					entries: allEntries,
				},
			];
		}

		const shouldApplySubGroup =
			typeof this.subGroupPropertyId === "string" &&
			this.subGroupPropertyId.length > 0 &&
			!useSubGroupAsPrimary &&
			this.subGroupPropertyId !== primaryGroupByPropertyId;

		const result: RenderableNestedGroup[] = [];
		for (let index = 0; index < primaryGroups.length; index++) {
			const primary = primaryGroups[index];
			if (primary.entries.length === 0) continue;

			const subGroups = shouldApplySubGroup
				? this.buildGroupsFromProperty(
					primary.entries,
					this.subGroupPropertyId!,
					this.unnestMultiValueGroup,
					primaryGroupSortDirection,
					`${primary.id}:sub`
				)
				: [];

			result.push({
				id: primary.id || `primary:${index}`,
				title: primary.title,
				entries: primary.entries,
				subGroups,
			});
		}

		return result;
	}

	private buildGroupsFromProperty(
		entries: EntryLike[],
		propertyId: string,
		unnest: boolean,
		direction: GroupSortDirection,
		idPrefix = "group"
	): RenderableGroup[] {
		const grouped = groupEntriesByValue(entries, (entry) => this.safeGetValue(entry, propertyId), {
			unnest,
			noneLabel: "None",
		});
		const sorted = sortGroupedEntries(grouped, direction);
		return sorted.map((bucket, index) => ({
			id: `${idPrefix}:${index}:${bucket.key}`,
			title: this.formatGroupTitle(propertyId, bucket.key),
			entries: bucket.entries,
		}));
	}

	private flattenNestedGroupsForVirtual(
		nestedGroups: RenderableNestedGroup[],
		columns: string[]
	): VirtualNestedGroupedItem[] {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const hasSummary = hasAnyTableSummary(columns, this.tableSummaries);
		const items: VirtualNestedGroupedItem[] = [];
		let rowOrder = 0;

		for (const primary of nestedGroups) {
			items.push({
				type: "primary-header",
				id: `primary-header:${primary.id}`,
				title: primary.title,
				count: primary.entries.length,
			});

			if (primary.subGroups.length > 0) {
				for (const subGroup of primary.subGroups) {
					items.push({
						type: "secondary-header",
						id: `secondary-header:${primary.id}:${subGroup.id}`,
						title: subGroup.title,
						count: subGroup.entries.length,
					});

					if (hasSummary) {
						items.push({
							type: "group-summary",
							id: `summary:${primary.id}:${subGroup.id}`,
							summaryValues: this.buildSummaryValues(subGroup.entries, columns),
							nested: true,
						});
					}

					for (let index = 0; index < subGroup.entries.length; index++) {
						items.push({
							type: "row",
							id: `row:${primary.id}:${subGroup.id}:${index}`,
							entry: subGroup.entries[index],
							rowOrder,
							nested: true,
						});
						rowOrder += 1;
					}
				}
				continue;
			}

			if (hasSummary) {
				items.push({
					type: "group-summary",
					id: `summary:${primary.id}`,
					summaryValues: this.buildSummaryValues(primary.entries, columns),
				});
			}

			for (let index = 0; index < primary.entries.length; index++) {
				items.push({
					type: "row",
					id: `row:${primary.id}:${index}`,
					entry: primary.entries[index],
					rowOrder,
				});
				rowOrder += 1;
			}
		}

		return items;
	}

	private renderNestedGroupedNormal(
		nestedGroups: RenderableNestedGroup[],
		columns: string[]
	): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		this.destroyVirtualScroller();
		this.virtualRowOrderToIndex.clear();
		this.normalRowOrderCursor = 0;
		if (!this.tableScrollEl) return;
		this.tableScrollEl.empty();
		this.renderedTables = [];

		for (const primary of nestedGroups) {
			const sectionEl = this.containerEl.ownerDocument.createElement("section");
			sectionEl.className = "bv-bases-table-group";

			const titleEl = this.containerEl.ownerDocument.createElement("h3");
			titleEl.className = "bv-bases-table-group-title";
			titleEl.setText(`${primary.title} (${primary.entries.length})`);
			sectionEl.appendChild(titleEl);

			if (primary.subGroups.length > 0) {
				for (const subGroup of primary.subGroups) {
					this.renderSubGroupSection(sectionEl, subGroup, columns);
				}
			} else {
				this.renderGroupTableIntoSection(sectionEl, primary.entries, columns);
			}

			this.tableScrollEl.appendChild(sectionEl);
		}
	}

	private renderSubGroupSection(
		sectionEl: HTMLElement,
		subGroup: RenderableGroup,
		columns: string[]
	): void {
		const subtitleEl = this.containerEl.ownerDocument.createElement("h4");
		subtitleEl.className = "bv-bases-table-subgroup-title";
		subtitleEl.setText(`${subGroup.title} (${subGroup.entries.length})`);
		sectionEl.appendChild(subtitleEl);
		this.renderGroupTableIntoSection(sectionEl, subGroup.entries, columns, true);
	}

	private renderGroupTableIntoSection(
		sectionEl: HTMLElement,
		entries: EntryLike[],
		columns: string[],
		nested = false
	): void {
		const tableWrapper = this.containerEl.ownerDocument.createElement("div");
		tableWrapper.className = "bv-bases-table-wrapper";
		if (nested) {
			tableWrapper.classList.add("bv-bases-table-wrapper--nested");
		}
		tableWrapper.style.minWidth = this.getTableMinWidth(columns);
		const tableEl = this.createTable(entries, columns, true);
		this.renderedTables.push(tableEl);
		tableWrapper.appendChild(tableEl);
		sectionEl.appendChild(tableWrapper);
	}

	private async renderNestedGroupedVirtual(
		items: VirtualNestedGroupedItem[],
		columns: string[],
		menuEntries: EntryLike[]
	): Promise<void> {
		// 描画要素の組み立てと状態反映をまとめて行い、再描画処理を一元化する。
		this.ensureVirtualLayout("grouped", columns, menuEntries, false);
		if (!this.virtualItemsHostEl) return;
		this.virtualRowOrderToIndex.clear();
		for (let virtualIndex = 0; virtualIndex < items.length; virtualIndex++) {
			const item = items[virtualIndex];
			if (item.type === "row") {
				this.virtualRowOrderToIndex.set(item.rowOrder, virtualIndex);
			}
		}

		if (!this.virtualScroller) {
			this.virtualScroller = new VirtualScroller<VirtualNestedGroupedItem>({
				container: this.virtualItemsHostEl,
				items,
				overscan: this.VIRTUAL_OVERSCAN,
				renderItem: (item) => {
					if (item.type === "primary-header") {
						return this.createVirtualPrimaryHeaderRow(item);
					}
					if (item.type === "secondary-header") {
						return this.createVirtualSecondaryHeaderRow(item);
					}
					if (item.type === "group-summary") {
						return this.createVirtualSummaryRow(item.summaryValues, columns, !!item.nested);
					}
					return this.createVirtualRow(item.entry, columns, !!item.nested, item.rowOrder);
				},
				getItemKey: (item) => item.id,
			});
			setTimeout(() => this.virtualScroller?.recalculate(), 0);
		} else {
			this.virtualScroller.updateItems(items);
		}
	}

	private extractRenderableGroups(
		groups: any[],
		direction: GroupSortDirection,
		propertyId: string | null
	): RenderableGroup[] {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const rawGroups: { key: string; entries: EntryLike[] }[] = [];

		for (const group of groups) {
			const entries = (group?.entries || []) as EntryLike[];
			if (entries.length === 0) continue;

			const title = this.dataAdapter.convertGroupKeyToString(group.key);
			rawGroups.push({
				key: title,
				entries,
			});
		}

		const sorted = sortGroupedEntries(rawGroups, direction);
		return sorted.map((group, index) => ({
			id: `${index}:${group.key}`,
			title: this.formatGroupTitle(propertyId, group.key),
			entries: group.entries,
		}));
	}

	private collectEntriesFromGroups(groups: RenderableGroup[]): EntryLike[] {
		const entries: EntryLike[] = [];
		for (const group of groups) {
			for (const entry of group.entries) {
				entries.push(entry);
			}
		}
		return entries;
	}

	private buildGroupedVirtualSources(
		groups: RenderableGroup[],
		columns: string[]
	): GroupedVirtualSource<EntryLike>[] {
		const shouldRenderSummary = hasAnyTableSummary(columns, this.tableSummaries);
		return groups.map((group) => ({
			id: group.id,
			title: group.title,
			entries: group.entries,
			summaryValues: shouldRenderSummary ? this.buildSummaryValues(group.entries, columns) : undefined,
		}));
	}

	private buildSummaryValues(
		entries: EntryLike[],
		columns: string[]
	): Record<string, string> {
		const summaryValues: Record<string, string> = {};
		for (const propertyId of columns) {
			const summaryKey = this.tableSummaries[propertyId];
			if (!summaryKey) continue;
			const values = entries.map((entry) => this.safeGetValue(entry, propertyId));
			summaryValues[propertyId] = calculateSummary(values, summaryKey);
		}
		return summaryValues;
	}

	private renderUngroupedNormal(entries: EntryLike[], columns: string[]): void {
		this.destroyVirtualScroller();
		this.virtualRowOrderToIndex.clear();
		this.normalRowOrderCursor = 0;
		if (!this.tableScrollEl) return;
		this.tableScrollEl.empty();
		this.renderedTables = [];

		const tableWrapper = this.containerEl.ownerDocument.createElement("div");
		tableWrapper.className = "bv-bases-table-wrapper";
		tableWrapper.style.minWidth = this.getTableMinWidth(columns);
		const tableEl = this.createTable(entries, columns, false);
		this.renderedTables.push(tableEl);
		tableWrapper.appendChild(tableEl);
		this.tableScrollEl.appendChild(tableWrapper);
	}

	private renderGroupedNormal(groups: RenderableGroup[], columns: string[]): void {
		this.destroyVirtualScroller();
		this.virtualRowOrderToIndex.clear();
		this.prepareDuplicateNavigation(this.collectEntriesFromGroups(groups));
		if (!this.tableScrollEl) return;
		this.tableScrollEl.empty();
		this.renderedTables = [];

		for (const group of groups) {
			this.renderGroupSection(group.title, group.entries, columns);
		}
	}

	private async renderUngroupedVirtual(
		entries: EntryLike[],
		columns: string[]
	): Promise<void> {
		// 描画要素の組み立てと状態反映をまとめて行い、再描画処理を一元化する。
		this.ensureVirtualLayout("ungrouped", columns, entries, true);
		if (!this.virtualItemsHostEl) return;
		this.virtualRowOrderToIndex.clear();
		for (let rowOrder = 0; rowOrder < entries.length; rowOrder++) {
			this.virtualRowOrderToIndex.set(rowOrder, rowOrder);
		}

		this.updateVirtualFooterSummary(entries, columns);

		if (!this.virtualScroller) {
			this.virtualScroller = new VirtualScroller<EntryLike>({
				container: this.virtualItemsHostEl,
				items: entries,
				overscan: this.VIRTUAL_OVERSCAN,
				renderItem: (entry, index) => this.createVirtualRow(entry, columns, false, index),
				getItemKey: (entry, index) => entry.file?.path || `row-${index}`,
			});
			setTimeout(() => this.virtualScroller?.recalculate(), 0);
		} else {
			this.virtualScroller.updateItems(entries);
		}
	}

	private async renderGroupedVirtual(
		items: VirtualGroupedItem<EntryLike>[],
		columns: string[],
		menuEntries: EntryLike[]
	): Promise<void> {
		// 描画要素の組み立てと状態反映をまとめて行い、再描画処理を一元化する。
		this.ensureVirtualLayout("grouped", columns, menuEntries, false);
		if (!this.virtualItemsHostEl) return;
		this.virtualRowOrderToIndex.clear();

		if (!this.virtualScroller) {
			this.virtualScroller = new VirtualScroller<VirtualGroupedItem<EntryLike>>({
				container: this.virtualItemsHostEl,
				items,
				overscan: this.VIRTUAL_OVERSCAN,
				renderItem: (item) => {
					if (item.type === "group-header") {
						return this.createVirtualGroupHeaderRow(item);
					}
					if (item.type === "group-summary") {
						return this.createVirtualGroupSummaryRow(item, columns);
					}
					return this.createVirtualRow(item.entry, columns);
				},
				getItemKey: (item) => item.id,
			});
			setTimeout(() => this.virtualScroller?.recalculate(), 0);
		} else {
			this.virtualScroller.updateItems(items);
		}
	}

	private ensureVirtualLayout(
		mode: Exclude<VirtualMode, "none">,
		columns: string[],
		menuEntries: EntryLike[],
		includeFooter: boolean
	): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		if (!this.tableScrollEl) return;

		const columnsKey = columns.join("|");
		const template = this.getColumnTemplate(columns);
		const minWidth = this.getTableMinWidth(columns);
		const hasFooterNow = !!this.virtualFooterRowEl;

		const needsRebuild =
			!this.virtualItemsHostEl ||
			this.virtualMode !== mode ||
			this.virtualColumnsKey !== columnsKey ||
			hasFooterNow !== includeFooter;

		if (!needsRebuild) {
			this.virtualMenuEntries = menuEntries;
			this.virtualColumnTemplate = template;
			this.virtualMinWidth = minWidth;
			this.syncVirtualLayoutDimensions();
			return;
		}

		this.destroyVirtualScroller();
		this.tableScrollEl.empty();
		this.renderedTables = [];
		this.virtualMenuEntries = menuEntries;
		this.virtualColumnTemplate = template;
		this.virtualMinWidth = minWidth;

		const doc = this.containerEl.ownerDocument;
		const virtualContainer = doc.createElement("div");
		virtualContainer.className = "bv-bases-table-wrapper bv-bases-table-virtual";
		virtualContainer.style.setProperty("--tn-table-columns-template", template);
		virtualContainer.style.setProperty("--tn-table-min-width", minWidth);
		virtualContainer.style.minWidth = minWidth;

		const headerRow = this.createVirtualHeaderRow(columns);
		virtualContainer.appendChild(headerRow);

		const viewport = doc.createElement("div");
		viewport.className = "bv-bases-table-virtual-viewport";
		virtualContainer.appendChild(viewport);

		const host = doc.createElement("div");
		host.className = "bv-bases-table-virtual-host";
		viewport.appendChild(host);

		let footerRow: HTMLElement | null = null;
		if (includeFooter) {
			footerRow = doc.createElement("div");
			footerRow.className = "bv-bases-table-summary-row bv-bases-table-summary-row--virtual";
			virtualContainer.appendChild(footerRow);
		}

		this.tableScrollEl.appendChild(virtualContainer);
		this.virtualContainerEl = virtualContainer;
		this.virtualItemsHostEl = host;
		this.virtualHeaderRowEl = headerRow;
		this.virtualFooterRowEl = footerRow;
		this.virtualMode = mode;
		this.virtualColumnsKey = columnsKey;
		this.useVirtualScrolling = true;
		this.syncVirtualLayoutDimensions();
	}

	private updateVirtualFooterSummary(entries: EntryLike[], columns: string[]): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		if (!this.virtualFooterRowEl) return;

		const hasSummary = hasAnyTableSummary(columns, this.tableSummaries);
		this.virtualFooterRowEl.empty();

		if (!hasSummary) {
			this.virtualFooterRowEl.style.display = "none";
			return;
		}

		this.virtualFooterRowEl.style.display = "grid";
		this.virtualFooterRowEl.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		this.virtualFooterRowEl.style.minWidth = "var(--tn-table-min-width)";

		for (const propertyId of columns) {
			const cell = this.containerEl.ownerDocument.createElement("div");
			cell.className = "bv-bases-table-summary-cell";

			const summaryKey = this.tableSummaries[propertyId];
			if (summaryKey) {
				const values = entries.map((entry) => this.safeGetValue(entry, propertyId));
				cell.setText(calculateSummary(values, summaryKey));
				cell.dataset.summary = summaryKey;
			}

			this.virtualFooterRowEl.appendChild(cell);
		}
	}

	private createVirtualHeaderRow(columns: string[]): HTMLElement {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const doc = this.containerEl.ownerDocument;
		const row = doc.createElement("div");
		row.className = "bv-bases-table-header-row bv-bases-table-header-row--virtual";
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (let index = 0; index < columns.length; index++) {
			const propertyId = columns[index];
			const cell = doc.createElement("div");
			cell.className = "bv-bases-table-header-cell bv-bases-table-header-cell--virtual";
			cell.appendChild(this.createHeaderCellLabel(propertyId));
			cell.dataset.propertyId = propertyId;
			cell.addEventListener("contextmenu", (event) =>
				this.showSummaryMenu(event as MouseEvent, propertyId, this.virtualMenuEntries)
			);
			this.appendColumnResizeHandle(cell, columns, propertyId, index === columns.length - 1);
			row.appendChild(cell);
		}

		return row;
	}

	private createVirtualRow(
		entry: EntryLike,
		columns: string[],
		nested = false,
		rowOrder: number | null = null
	): HTMLElement {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const doc = this.containerEl.ownerDocument;
		const row = doc.createElement("div");
		row.className = "bv-bases-table-row bv-bases-table-row--virtual";
		if (nested) {
			row.classList.add("bv-bases-table-row--nested");
		}
		if (typeof rowOrder === "number" && Number.isFinite(rowOrder)) {
			row.dataset.tnRowOrder = String(rowOrder);
		}
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (const propertyId of columns) {
			const cell = doc.createElement("div");
			cell.className = "bv-bases-table-cell";
			this.renderCell(cell, entry, propertyId, rowOrder);
			row.appendChild(cell);
		}

		return row;
	}

	private createVirtualPrimaryHeaderRow(item: { title: string; count: number }): HTMLElement {
		const row = this.containerEl.ownerDocument.createElement("div");
		row.className = "bv-bases-table-group-title-row bv-bases-table-group-title-row--primary";
		row.style.minWidth = "var(--tn-table-min-width)";
		row.setText(`${item.title} (${item.count})`);
		return row;
	}

	private createVirtualSecondaryHeaderRow(item: { title: string; count: number }): HTMLElement {
		const row = this.containerEl.ownerDocument.createElement("div");
		row.className = "bv-bases-table-group-title-row bv-bases-table-group-title-row--secondary";
		row.style.minWidth = "var(--tn-table-min-width)";
		row.setText(`${item.title} (${item.count})`);
		return row;
	}

	private createVirtualSummaryRow(
		summaryValues: Record<string, string>,
		columns: string[],
		nested = false
	): HTMLElement {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const row = this.containerEl.ownerDocument.createElement("div");
		row.className = "bv-bases-table-summary-row bv-bases-table-summary-row--group bv-bases-table-summary-row--virtual";
		if (nested) {
			row.classList.add("bv-bases-table-summary-row--nested");
		}
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (const propertyId of columns) {
			const cell = this.containerEl.ownerDocument.createElement("div");
			cell.className = "bv-bases-table-summary-cell";
			cell.setText(summaryValues[propertyId] || "");
			row.appendChild(cell);
		}

		return row;
	}

	private createVirtualGroupHeaderRow(
		item: Extract<VirtualGroupedItem<EntryLike>, { type: "group-header" }>
	): HTMLElement {
		return this.createVirtualPrimaryHeaderRow(item);
	}

	private createVirtualGroupSummaryRow(
		item: Extract<VirtualGroupedItem<EntryLike>, { type: "group-summary" }>,
		columns: string[]
	): HTMLElement {
		return this.createVirtualSummaryRow(item.summaryValues, columns);
	}

	private getColumnTemplate(columns: string[]): string {
		const widths = resolveColumnWidths(
			columns,
			this.columnSize,
			this.DEFAULT_COLUMN_WIDTH,
			this.MIN_COLUMN_WIDTH
		);
		return buildColumnTemplateFromWidths(widths);
	}

	private getTableMinWidth(columns: string[]): string {
		const widths = resolveColumnWidths(
			columns,
			this.columnSize,
			this.DEFAULT_COLUMN_WIDTH,
			this.MIN_COLUMN_WIDTH
		);
		return `${calcTotalColumnWidth(widths)}px`;
	}

	private syncVirtualLayoutDimensions(): void {
		if (!this.virtualContainerEl) return;
		this.virtualContainerEl.style.setProperty("--tn-table-columns-template", this.virtualColumnTemplate);
		this.virtualContainerEl.style.setProperty("--tn-table-min-width", this.virtualMinWidth);
		this.virtualContainerEl.style.minWidth = this.virtualMinWidth;
	}

	private syncNormalTableWidths(columns: string[]): void {
		// 関連状態の差分を吸収し、整合性を保った状態へ同期する。
		const widths = resolveColumnWidths(
			columns,
			this.columnSize,
			this.DEFAULT_COLUMN_WIDTH,
			this.MIN_COLUMN_WIDTH
		);
		const minWidth = `${calcTotalColumnWidth(widths)}px`;

		for (const table of this.renderedTables) {
			const colEls = table.querySelectorAll("col[data-property-id]");
			for (let i = 0; i < colEls.length; i++) {
				const colEl = colEls[i] as HTMLTableColElement;
				const width = widths[i] ?? this.DEFAULT_COLUMN_WIDTH;
				colEl.style.width = `${width}px`;
				colEl.style.minWidth = `${width}px`;
			}
			table.style.setProperty("--tn-table-min-width", minWidth);
			const wrapper = table.parentElement;
			if (wrapper instanceof HTMLElement) {
				wrapper.style.minWidth = minWidth;
			}
		}
	}

	private applyColumnWidths(columns: string[]): void {
		this.virtualColumnTemplate = this.getColumnTemplate(columns);
		this.virtualMinWidth = this.getTableMinWidth(columns);
		this.syncVirtualLayoutDimensions();
		this.syncNormalTableWidths(columns);
	}

	private appendColumnResizeHandle(
		headerCell: HTMLElement,
		columns: string[],
		propertyId: string,
		isLastColumn: boolean
	): void {
		if (isLastColumn) return;

		const handle = this.containerEl.ownerDocument.createElement("div");
		handle.className = "bv-bases-table-resize-handle";
		handle.setAttribute("role", "separator");
		handle.setAttribute("aria-orientation", "vertical");

		handle.addEventListener("pointerdown", (event) =>
			this.startColumnResize(event as PointerEvent, columns, propertyId)
		);
		handle.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		handle.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});

		headerCell.appendChild(handle);
	}

	private startColumnResize(
		event: PointerEvent,
		columns: string[],
		propertyId: string
	): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		event.preventDefault();
		event.stopPropagation();

		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView || window;
		const startX = event.clientX;
		const initialWidth = resolveColumnWidths(
			[propertyId],
			this.columnSize,
			this.DEFAULT_COLUMN_WIDTH,
			this.MIN_COLUMN_WIDTH
		)[0];
		let hasWidthChanged = false;

		this.stopActiveColumnResize();
		this.rootElement?.classList.add("bv-bases-table--resizing");

		const onPointerMove = (moveEvent: PointerEvent): void => {
			const deltaX = moveEvent.clientX - startX;
			const nextWidth = initialWidth + deltaX;
			const nextSize = setColumnSizeValue(
				this.columnSize,
				propertyId,
				nextWidth,
				this.DEFAULT_COLUMN_WIDTH,
				this.MIN_COLUMN_WIDTH
			);

			const currentWidth = this.columnSize[propertyId] ?? this.DEFAULT_COLUMN_WIDTH;
			const normalizedCurrent = Math.max(this.MIN_COLUMN_WIDTH, Math.round(currentWidth));
			const normalizedNext = nextSize[propertyId] ?? this.DEFAULT_COLUMN_WIDTH;
			if (normalizedCurrent === normalizedNext) return;

			this.columnSize = nextSize;
			hasWidthChanged = true;
			this.applyColumnWidths(columns);
		};

		const onPointerUp = (): void => {
			this.stopActiveColumnResize();
			if (hasWidthChanged) {
				this.persistColumnSize();
			}
		};

		doc.addEventListener("pointermove", onPointerMove);
		doc.addEventListener("pointerup", onPointerUp, { once: true });
		doc.addEventListener("pointercancel", onPointerUp, { once: true });
		win.addEventListener("blur", onPointerUp, { once: true });

		this.activeColumnResizeCleanup = () => {
			doc.removeEventListener("pointermove", onPointerMove);
			doc.removeEventListener("pointerup", onPointerUp as EventListener);
			doc.removeEventListener("pointercancel", onPointerUp as EventListener);
			win.removeEventListener("blur", onPointerUp as EventListener);
			this.rootElement?.classList.remove("bv-bases-table--resizing");
			this.activeColumnResizeCleanup = null;
		};
	}

	private stopActiveColumnResize(): void {
		if (this.activeColumnResizeCleanup) {
			this.activeColumnResizeCleanup();
		}
	}

	private persistColumnSize(): void {
		try {
			if (!this.config?.set) return;
			if (Object.keys(this.columnSize).length === 0) {
				this.config.set("columnSize", {});
				return;
			}
			this.config.set("columnSize", this.columnSize);
		} catch (error) {
			console.error("[BaseViews][CustomTableView] Failed to persist column sizes:", error);
		}
	}

	private renderGroupSection(groupTitle: string, entries: EntryLike[], columns: string[]): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;

		const sectionEl = doc.createElement("section");
		sectionEl.className = "bv-bases-table-group";

		const titleEl = doc.createElement("h3");
		titleEl.className = "bv-bases-table-group-title";
		titleEl.setText(`${groupTitle} (${entries.length})`);
		sectionEl.appendChild(titleEl);

		const tableWrapper = doc.createElement("div");
		tableWrapper.className = "bv-bases-table-wrapper";
		tableWrapper.style.minWidth = this.getTableMinWidth(columns);
		const tableEl = this.createTable(entries, columns, true);
		this.renderedTables.push(tableEl);
		tableWrapper.appendChild(tableEl);
		sectionEl.appendChild(tableWrapper);

		this.tableScrollEl.appendChild(sectionEl);
	}

	private createTable(entries: EntryLike[], columns: string[], groupedSection: boolean): HTMLTableElement {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const doc = this.containerEl.ownerDocument;
		const tableEl = doc.createElement("table");
		tableEl.className = "bv-bases-custom-table";
		tableEl.style.setProperty("--tn-table-min-width", this.getTableMinWidth(columns));

		const widths = resolveColumnWidths(
			columns,
			this.columnSize,
			this.DEFAULT_COLUMN_WIDTH,
			this.MIN_COLUMN_WIDTH
		);
		const colgroupEl = doc.createElement("colgroup");
		for (let index = 0; index < columns.length; index++) {
			const colEl = doc.createElement("col");
			colEl.dataset.propertyId = columns[index];
			colEl.style.width = `${widths[index]}px`;
			colEl.style.minWidth = `${widths[index]}px`;
			colgroupEl.appendChild(colEl);
		}
		tableEl.appendChild(colgroupEl);

		const theadEl = tableEl.createTHead();
		const headerRow = theadEl.insertRow();
		headerRow.className = "bv-bases-table-header-row";

		for (let index = 0; index < columns.length; index++) {
			const propertyId = columns[index];
			const th = doc.createElement("th");
			th.className = "bv-bases-table-header-cell";
			th.appendChild(this.createHeaderCellLabel(propertyId));
			th.dataset.propertyId = propertyId;
			th.addEventListener("contextmenu", (event) =>
				this.showSummaryMenu(event as MouseEvent, propertyId, entries)
			);
			this.appendColumnResizeHandle(th, columns, propertyId, index === columns.length - 1);
			headerRow.appendChild(th);
		}

		const tbodyEl = tableEl.createTBody();

		if (groupedSection) {
			this.appendSummaryRow(tbodyEl, entries, columns, true);
		}

		for (const entry of entries) {
			const row = tbodyEl.insertRow();
			row.className = "bv-bases-table-row";
			const rowOrder = this.consumeNormalRowOrder();
			row.dataset.tnRowOrder = String(rowOrder);
			for (const propertyId of columns) {
				const td = row.insertCell();
				td.className = "bv-bases-table-cell";
				this.renderCell(td, entry, propertyId, rowOrder);
			}
		}

		if (!groupedSection && hasAnyTableSummary(columns, this.tableSummaries)) {
			const tfootEl = tableEl.createTFoot();
			this.appendSummaryRow(tfootEl, entries, columns, false);
		}

		return tableEl;
	}

	private createHeaderCellLabel(propertyId: string): HTMLElement {
		const doc = this.containerEl.ownerDocument;
		const wrapper = doc.createElement("span");
		wrapper.className = "bv-bases-table-header-label";

		const iconEl = doc.createElement("span");
		iconEl.className = "bv-bases-table-header-icon";
		iconEl.setAttribute("aria-hidden", "true");
		this.renderHeaderIcon(iconEl, propertyId);
		wrapper.appendChild(iconEl);

		const textEl = doc.createElement("span");
		textEl.className = "bv-bases-table-header-text";
		textEl.setText(this.getPropertyDisplayName(propertyId));
		wrapper.appendChild(textEl);

		return wrapper;
	}

	private renderHeaderIcon(iconEl: HTMLElement, propertyId: string): void {
		const iconName = this.resolvePropertyHeaderIcon(propertyId);
		try {
			setIcon(iconEl, iconName);
		} catch {
			setIcon(iconEl, "list");
		}
	}

	private getPropertyDisplayName(propertyId: string): string {
		return this.config?.getDisplayName?.(propertyId) || propertyId;
	}

	private formatGroupTitle(propertyId: string | null, groupTitle: string): string {
		const propertyDisplayName =
			typeof propertyId === "string" && propertyId.length > 0
				? this.getPropertyDisplayName(propertyId)
				: null;
		return formatGroupTitleWithProperty(
			groupTitle,
			propertyDisplayName,
			this.showGroupingPropertyName
		);
	}

	private resolvePropertyHeaderIcon(propertyId: string): string {
		// 候補集合から条件に合う値を解決し、未検出時の分岐を吸収する。
		const metadataIcon = this.resolvePropertyIconFromMetadata(propertyId);
		if (metadataIcon) return metadataIcon;

		const [scope, rawName] = propertyId.split(".", 2);
		const name = (rawName ?? propertyId).toLowerCase();

		if (scope === "file") return "file-text";
		if (scope === "task") return "check-square";
		if (scope === "formula") return "table-cells-merge";
		if (scope === "note" && (name.includes("link") || name.includes("url"))) return "link-2";
		if (name.includes("status")) return "circle";
		if (name.includes("priority")) return "star";
		if (
			name.includes("date") ||
			name.includes("scheduled") ||
			name.includes("due") ||
			name.includes("deadline") ||
			name.includes("start") ||
			name.includes("end")
		) {
			return "calendar";
		}
		if (name.includes("time") || name.includes("duration")) return "clock";
		if (name.includes("link") || name.includes("url")) return "link-2";
		if (name.includes("project") || name.includes("folder")) return "folder-tree";
		if (name.includes("tag")) return "list";
		return "file-text";
	}

	private resolvePropertyIconFromMetadata(propertyId: string): string | null {
		// 候補集合から条件に合う値を解決し、未検出時の分岐を吸収する。
		const [scope, rawName] = propertyId.split(".", 2);
		const candidates = new Set<string>();
		candidates.add(propertyId.toLowerCase());
		candidates.add(propertyId);
		if (rawName) {
			candidates.add(rawName.toLowerCase());
			candidates.add(rawName);
		}
		if (scope) {
			candidates.add(scope.toLowerCase());
		}

		const metadataTypeManager = (this.app as any)?.metadataTypeManager;
		const properties = metadataTypeManager?.properties;
		if (!properties || typeof properties !== "object") return null;

		for (const key of candidates) {
			const propertyDef = properties[key] as PropertyMetadataLike | undefined;
			if (!propertyDef || typeof propertyDef !== "object") continue;

			const explicitIcon = this.asNonEmptyString(propertyDef.icon);
			if (explicitIcon) return explicitIcon;

			const mappedByType = this.resolveIconFromPropertyType(
				this.asNonEmptyString(propertyDef.type),
				this.asNonEmptyString(propertyDef.widget)
			);
			if (mappedByType) return mappedByType;
		}

		return null;
	}

	private resolveIconFromPropertyType(...values: Array<string | null>): string | null {
		for (const value of values) {
			if (!value) continue;
			const mapped = PROPERTY_TYPE_ICON_MAP[value.toLowerCase()];
			if (mapped) return mapped;
		}
		return null;
	}

	private asNonEmptyString(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	private appendSummaryRow(
		sectionEl: HTMLTableSectionElement,
		entries: EntryLike[],
		columns: string[],
		groupedSection: boolean
	): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const hasSummary = hasAnyTableSummary(columns, this.tableSummaries);
		if (!hasSummary) return;

		const row = sectionEl.insertRow();
		row.className = groupedSection
			? "bv-bases-table-summary-row bv-bases-table-summary-row--group"
			: "bv-bases-table-summary-row";

		for (const propertyId of columns) {
			const cell = groupedSection ? sectionEl.ownerDocument.createElement("td") : row.insertCell();
			cell.className = "bv-bases-table-summary-cell";
			const summaryKey = this.tableSummaries[propertyId];
			if (summaryKey) {
				const values = entries.map((entry) => this.safeGetValue(entry, propertyId));
				cell.setText(calculateSummary(values, summaryKey));
				cell.dataset.summary = summaryKey;
			}
			if (groupedSection) {
				row.appendChild(cell);
			}
		}
	}

	private showSummaryMenu(event: MouseEvent, propertyId: string, entries: EntryLike[]): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		event.preventDefault();

		const menu = new Menu();
		const current = this.tableSummaries[propertyId];
		const values = entries.map((entry) => this.safeGetValue(entry, propertyId));
		const options = getSummaryOptions(values);

		if (current) {
			menu.addItem((item) => {
				item.setTitle("Remove summary");
				item.setIcon("x");
				item.onClick(() => this.setSummaryForColumn(propertyId, null));
			});
			menu.addSeparator();
		}

		for (const option of options) {
			menu.addItem((item) => {
				item.setTitle(option.key === current ? `✓ ${option.label}` : option.label);
				item.onClick(() => this.setSummaryForColumn(propertyId, option.key));
			});
		}

		menu.showAtMouseEvent(event);
	}

	private setSummaryForColumn(propertyId: string, summaryKey: TableSummaryKey | null): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		try {
			const next = { ...this.tableSummaries };
			if (!summaryKey) {
				delete next[propertyId];
			} else {
				next[propertyId] = summaryKey;
			}
			this.tableSummaries = next;
			this.config?.set?.("tableSummaries", next);
			void this.render();
		} catch (error) {
			console.error("[BaseViews][CustomTableView] Failed to update table summary setting:", error);
			new Notice("Failed to update summary setting.");
		}
	}

	private renderCell(
		cellEl: HTMLElement,
		entry: EntryLike,
		propertyId: string,
		rowOrder: number | null = null
	): void {
		const value = this.safeGetValue(entry, propertyId);

		if (this.isFileNameColumn(propertyId)) {
			this.renderFileLink(cellEl, entry, rowOrder);
			return;
		}

		this.renderValue(cellEl, value);
	}

	private safeGetValue(entry: EntryLike, propertyId: string): any {
		try {
			return entry.getValue(propertyId);
		} catch {
			return null;
		}
	}

	private isFileNameColumn(propertyId: string): boolean {
		if (propertyId === "file.name") return true;
		const [prefix, name] = propertyId.split(".", 2);
		return prefix === "file" && name === "name";
	}

	private renderFileLink(
		cellEl: HTMLElement,
		entry: EntryLike,
		rowOrder: number | null = null
	): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const filePath = entry.file?.path;
		const fileName = entry.file?.name || filePath;
		if (!filePath || !fileName) {
			cellEl.setText("");
			return;
		}

		const linkWrapper = this.containerEl.ownerDocument.createElement("span");
		linkWrapper.className = "bv-bases-table-file-link-wrap";

		if (this.showIconicIconInNameColumn) {
			const iconicIcon = resolveIconicFileIcon(this.app || this.plugin.app, filePath);
			if (iconicIcon) {
				const iconEl = this.containerEl.ownerDocument.createElement("span");
				iconEl.className = "bv-bases-table-file-icon";
				iconEl.setAttribute("aria-hidden", "true");
				this.renderIconicFileIcon(iconEl, iconicIcon.icon);
				if (iconicIcon.color) {
					iconEl.style.color = iconicIcon.color;
				}
				linkWrapper.appendChild(iconEl);
			}
		}

		const linkEl = this.containerEl.ownerDocument.createElement("a");
		linkEl.className = "bv-bases-table-file-link internal-link";
		linkEl.setText(fileName);
		linkEl.href = "#";
		linkEl.setAttribute("data-href", filePath);

		linkEl.addEventListener("click", (evt) => {
			if (evt.button !== 0) return;
			evt.preventDefault();
			const modEvent = Keymap.isModEvent(evt);
			void (this.app || this.plugin.app).workspace.openLinkText(filePath, "", modEvent);
		});

		linkEl.addEventListener("auxclick", (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			evt.stopPropagation();
			void (this.app || this.plugin.app).workspace.openLinkText(filePath, "", true);
		});

		linkEl.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.showFileLinkContextMenu(evt, filePath);
		});

		linkEl.addEventListener("mouseover", (evt) => {
			(this.app || this.plugin.app).workspace.trigger("hover-link", {
				event: evt,
				source: "tasknotes-bases-custom-table",
				hoverParent: linkWrapper,
				targetEl: linkEl,
				linktext: filePath,
			});
		});

		linkWrapper.appendChild(linkEl);

		if (
			this.unnestMultiValueGroup &&
			typeof rowOrder === "number" &&
			hasDuplicateNavigationTarget(this.duplicateNavigationIndex, filePath)
		) {
			const jumpButton = this.containerEl.ownerDocument.createElement("button");
			jumpButton.type = "button";
			jumpButton.className = "bv-bases-table-duplicate-jump";
			jumpButton.setAttribute("aria-label", "Jump to next same file row");
			jumpButton.setAttribute("title", "Jump to next same file row");
			setIcon(jumpButton, "git-branch");
			jumpButton.addEventListener("pointerdown", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
			});
			jumpButton.addEventListener("click", (evt) => {
				evt.preventDefault();
				evt.stopPropagation();
				this.jumpToNextDuplicateFileRow(filePath, rowOrder);
			});
			linkWrapper.appendChild(jumpButton);
		}

		cellEl.appendChild(linkWrapper);
	}

	private jumpToNextDuplicateFileRow(filePath: string, currentRowOrder: number): void {
		const nextRowOrder = getNextDuplicateRowOrder(
			this.duplicateNavigationIndex,
			filePath,
			currentRowOrder
		);
		if (typeof nextRowOrder !== "number") return;

		this.scrollToRowOrder(nextRowOrder);
	}

	private scrollToRowOrder(rowOrder: number): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		try {
			if (this.useVirtualScrolling && this.virtualScroller) {
				const targetVirtualIndex =
					this.virtualMode === "grouped"
						? this.virtualRowOrderToIndex.get(rowOrder)
						: rowOrder;
				if (typeof targetVirtualIndex !== "number" || !Number.isFinite(targetVirtualIndex)) {
					return;
				}
				this.virtualScroller.scrollToIndex(
					targetVirtualIndex,
					"smooth",
					this.DUPLICATE_JUMP_SCROLL_DURATION_MS
				);
				this.scheduleJumpTargetHighlight(rowOrder);
				return;
			}

			const targetRow = this.rootElement?.querySelector<HTMLElement>(
				`[data-tn-row-order="${rowOrder}"]`
			);
			if (!targetRow) return;
			this.fastScrollRowIntoView(targetRow);
			this.scheduleJumpTargetHighlight(rowOrder);
		} catch {
			// Defensive no-op: duplicate jump should never break table rendering.
		}
	}

	private fastScrollRowIntoView(targetRow: HTMLElement): void {
		const container = this.tableScrollEl;
		if (!container || !container.isConnected) {
			targetRow.scrollIntoView({
				block: "center",
				behavior: "smooth",
			});
			return;
		}

		const containerRect = container.getBoundingClientRect();
		const rowRect = targetRow.getBoundingClientRect();
		const rowTopInContainer = rowRect.top - containerRect.top + container.scrollTop;
		const centeredTop =
			rowTopInContainer - Math.max(0, (container.clientHeight - rowRect.height) / 2);
		this.animateContainerScrollTo(container, centeredTop, this.DUPLICATE_JUMP_SCROLL_DURATION_MS);
	}

	private animateContainerScrollTo(
		container: HTMLElement,
		targetTop: number,
		durationMs: number
	): void {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		this.stopDuplicateJumpAnimation();
		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView || window;
		const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
		const clampedTarget = Math.max(0, Math.min(maxTop, targetTop));
		const startTop = container.scrollTop;
		const delta = clampedTarget - startTop;
		if (Math.abs(delta) < 1) {
			container.scrollTop = clampedTarget;
			return;
		}

		const startTime = win.performance?.now?.() ?? Date.now();
		const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
		const tick = (now: number): void => {
			const elapsed = now - startTime;
			const progress = Math.max(0, Math.min(1, elapsed / durationMs));
			container.scrollTop = startTop + delta * easeOutCubic(progress);
			if (progress < 1) {
				this.duplicateJumpAnimationRAF = win.requestAnimationFrame(tick);
				return;
			}
			this.duplicateJumpAnimationRAF = null;
		};

		this.duplicateJumpAnimationRAF = win.requestAnimationFrame(tick);
	}

	private stopDuplicateJumpAnimation(): void {
		if (this.duplicateJumpAnimationRAF === null) return;
		const doc = this.containerEl.ownerDocument;
		const win = doc.defaultView || window;
		win.cancelAnimationFrame(this.duplicateJumpAnimationRAF);
		this.duplicateJumpAnimationRAF = null;
	}

	private showFileLinkContextMenu(event: MouseEvent, filePath: string): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const app = this.app || this.plugin.app;
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) return;

		const menu = new Menu();
		let populated = false;

		try {
			app.workspace.trigger("file-menu", menu, file, "tasknotes-bases-custom-table");
			populated = ((menu as any).items?.length ?? 0) > 0;
		} catch {
			populated = false;
		}

		if (!populated) {
			menu.addItem((item) => {
				item.setTitle("Open");
				item.setIcon("file-text");
				item.onClick(() => {
					void app.workspace.getLeaf(false).openFile(file);
				});
			});
			menu.addItem((item) => {
				item.setTitle("Open in new tab");
				item.setIcon("external-link");
				item.onClick(() => {
					void app.workspace.openLinkText(file.path, "", true);
				});
			});
		}

		menu.showAtMouseEvent(event);
	}

	private renderIconicFileIcon(iconEl: HTMLElement, iconId: string): void {
		const lucideName = this.normalizeIconicLucideIconName(iconId);
		if (lucideName) {
			try {
				setIcon(iconEl, lucideName);
				iconEl.classList.add("bv-bases-table-file-icon--lucide");
				return;
			} catch {
				// Fallback to text rendering below.
			}
		}

		iconEl.classList.add("bv-bases-table-file-icon--text");
		iconEl.setText(iconId);
	}

	private normalizeIconicLucideIconName(icon: string): string | null {
		if (typeof icon !== "string") return null;
		const trimmed = icon.trim();
		if (trimmed.length === 0) return null;

		if (trimmed.startsWith(LUCIDE_PREFIX)) {
			const name = trimmed.slice(LUCIDE_PREFIX.length);
			return name.length > 0 ? name : null;
		}

		return /^[a-z0-9-]+$/i.test(trimmed) ? trimmed : null;
	}

	private renderValue(cellEl: HTMLElement, value: any): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		if (value == null || (typeof value.isEmpty === "function" && value.isEmpty())) {
			cellEl.classList.add("bv-bases-table-cell--empty");
			cellEl.setText("");
			return;
		}

		if (typeof value.renderTo === "function") {
			try {
				// RenderContext is not publicly exported in all obsidian typings versions.
				// A minimal hover parent object is enough for renderTo in table cells.
				value.renderTo(cellEl, { hoverPopover: null } as any);
				return;
			} catch (error) {
				console.debug("[BaseViews][CustomTableView] value.renderTo failed; fallback to toString()", error);
			}
		}

		const textEl = this.containerEl.ownerDocument.createElement("span");
		textEl.className = "bv-bases-table-text-value";
		textEl.setText(this.valueToString(value));
		cellEl.appendChild(textEl);
	}

	private valueToString(value: any): string {
		if (value == null) return "";
		try {
			if (typeof value.toString === "function") {
				const asString = value.toString();
				if (asString && asString !== "null" && asString !== "undefined") {
					return asString;
				}
			}
		} catch {
			// Fall back to String() below.
		}

		return String(value);
	}

	private renderEmptyState(message: string): void {
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;
		const emptyEl = doc.createElement("div");
		emptyEl.className = "bv-bases-empty";
		emptyEl.setText(message);
		this.tableScrollEl.appendChild(emptyEl);
	}

	renderError(error: Error): void {
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;
		const errorEl = doc.createElement("div");
		errorEl.className = "bv-bases-error";
		errorEl.style.cssText =
			"padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
		errorEl.setText(`Error loading table: ${error.message || "Unknown error"}`);
		this.tableScrollEl.appendChild(errorEl);
	}

	private destroyVirtualScroller(): void {
		if (this.virtualScroller) {
			this.virtualScroller.destroy();
			this.virtualScroller = null;
		}
		this.useVirtualScrolling = false;
		this.virtualMode = "none";
		this.virtualColumnsKey = "";
		this.virtualContainerEl = null;
		this.virtualItemsHostEl = null;
		this.virtualHeaderRowEl = null;
		this.virtualFooterRowEl = null;
		this.virtualMenuEntries = [];
		this.virtualColumnTemplate = "";
		this.virtualMinWidth = "";
		this.virtualRowOrderToIndex.clear();
	}

	protected async handleTaskUpdate(_task: TaskInfo): Promise<void> {
		this.debouncedRefresh();
	}
}

// Bases登録時にCustomTableViewインスタンスを生成するファクトリを返す。
export function buildCustomTableViewFactory(plugin: BaseViewsPlugin) {
	return function (controller: any, containerEl: HTMLElement): CustomTableView {
		if (!containerEl) {
			console.error("[BaseViews][CustomTableView] No containerEl provided");
			throw new Error("CustomTableView requires a containerEl");
		}
		return new CustomTableView(controller, containerEl, plugin);
	};
}



