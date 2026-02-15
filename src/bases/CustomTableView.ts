import { Keymap, Menu, Notice, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { calculateSummary, getSummaryOptions, TableSummaryKey } from "./tableSummary";
import { VirtualScroller } from "../utils/VirtualScroller";
import {
	CUSTOM_TABLE_VIRTUAL_OVERSCAN,
	CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED,
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

type RowHeightOption = "short" | "medium" | "tall" | "extraTall";
type VirtualMode = "none" | "ungrouped" | "grouped";

const VALID_ROW_HEIGHTS: RowHeightOption[] = ["short", "medium", "tall", "extraTall"];

type EntryLike = {
	file?: {
		path?: string;
		name?: string;
	};
	getValue: (propertyId: string) => any;
};

interface RenderableGroup {
	id: string;
	title: string;
	entries: EntryLike[];
}

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

	private readonly DEFAULT_COLUMN_WIDTH = DEFAULT_TABLE_COLUMN_WIDTH;
	private readonly MIN_COLUMN_WIDTH = MIN_TABLE_COLUMN_WIDTH;

	private readonly VIRTUAL_THRESHOLD_UNGROUPED = CUSTOM_TABLE_VIRTUAL_THRESHOLD_UNGROUPED;
	private readonly VIRTUAL_THRESHOLD_GROUPED = CUSTOM_TABLE_VIRTUAL_THRESHOLD_GROUPED;
	private readonly VIRTUAL_OVERSCAN = CUSTOM_TABLE_VIRTUAL_OVERSCAN;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);
		(this.dataAdapter as any).basesView = this;
	}

	onload(): void {
		this.readViewOptions();
		super.onload();
		this.register(() => this.destroyVirtualScroller());
		this.register(() => this.stopActiveColumnResize());
	}

	/**
	 * Optimize update timing:
	 * - First data update: render immediately.
	 * - View config changes (sort/order/group/options): render immediately.
	 * - Regular data churn: short debounce to avoid excessive rerenders.
	 */
	onDataUpdated(): void {
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
				console.error(`[TaskNotes][${this.type}] Render error:`, error);
				this.renderError(error as Error);
			}
		}, delay);
	}

	private buildViewConfigSignature(): string {
		try {
			const order = JSON.stringify(this.config?.getOrder?.() ?? []);
			const sort = JSON.stringify(this.config?.getSort?.() ?? []);
			const rowHeight = String(this.config?.get?.("rowHeight") ?? "medium");
			const summaries = JSON.stringify(this.config?.get?.("tableSummaries") ?? {});
			const columnSize = JSON.stringify(this.config?.get?.("columnSize") ?? {});
			const grouped = this.dataAdapter.isGrouped() ? "grouped" : "flat";
			return `${order}|${sort}|${rowHeight}|${summaries}|${columnSize}|${grouped}`;
		} catch {
			return "";
		}
	}

	protected setupContainer(): void {
		super.setupContainer();

		if (!this.rootElement) return;
		this.rootElement.classList.add("tn-bases-custom-table-view");
		this.rootElement.style.cssText = "display: flex; flex-direction: column; height: 100%;";

		const doc = this.containerEl.ownerDocument;
		this.tableScrollEl = doc.createElement("div");
		this.tableScrollEl.className = "tn-bases-table-scroll";
		this.rootElement.appendChild(this.tableScrollEl);
	}

	private readViewOptions(): void {
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

			this.configLoaded = true;
		} catch (error) {
			console.warn("[TaskNotes][CustomTableView] Failed to read view options:", error);
			this.rowHeight = "medium";
			this.tableSummaries = {};
			this.columnSize = {};
		}
	}

	private applyRowHeightClass(): void {
		if (!this.rootElement) return;
		for (const option of VALID_ROW_HEIGHTS) {
			this.rootElement.classList.remove(`tn-bases-table-row-height-${option}`);
		}
		this.rootElement.classList.add(`tn-bases-table-row-height-${this.rowHeight}`);
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
		if (!this.tableScrollEl) return;

		if (!this.configLoaded && this.config) {
			this.readViewOptions();
		}
		if (this.config) {
			// Reflect runtime changes when users tweak view options.
			this.readViewOptions();
		}

		this.applyRowHeightClass();

		if (!this.data?.data) {
			this.clearRenderedContent();
			return;
		}

		const columns = this.getVisibleColumns();
		if (columns.length === 0) {
			this.clearRenderedContent();
			this.renderEmptyState("No properties selected for this view.");
			return;
		}

		const groupedData = this.data?.groupedData || [];
		const isGrouped = this.dataAdapter.isGrouped();

		if (isGrouped) {
			const groups = this.extractRenderableGroups(groupedData);
			if (groups.length === 0) {
				this.clearRenderedContent();
				this.renderEmptyState("No rows match the current filters.");
				return;
			}

			const groupedSources = this.buildGroupedVirtualSources(groups, columns);
			const flattenedItems = flattenGroupedVirtualItems(groupedSources);
			const shouldVirtual = shouldUseGroupedVirtualization(
				flattenedItems.length,
				this.VIRTUAL_THRESHOLD_GROUPED
			);

			if (shouldVirtual) {
				await this.renderGroupedVirtual(flattenedItems, columns, this.collectEntriesFromGroups(groups));
			} else {
				this.renderGroupedNormal(groups, columns);
			}
			return;
		}

		const entries = (groupedData[0]?.entries || this.data?.data || []) as EntryLike[];
		if (entries.length === 0) {
			this.clearRenderedContent();
			this.renderEmptyState("No rows match the current filters.");
			return;
		}

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

	private clearRenderedContent(): void {
		this.stopActiveColumnResize();
		this.destroyVirtualScroller();
		this.renderedTables = [];
		this.tableScrollEl?.empty();
	}

	private extractRenderableGroups(groups: any[]): RenderableGroup[] {
		const result: RenderableGroup[] = [];
		let index = 0;

		for (const group of groups) {
			const entries = (group?.entries || []) as EntryLike[];
			if (entries.length === 0) continue;

			const title = this.dataAdapter.convertGroupKeyToString(group.key);
			result.push({
				id: `${index}:${title}`,
				title,
				entries,
			});
			index++;
		}

		return result;
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
		if (!this.tableScrollEl) return;
		this.tableScrollEl.empty();
		this.renderedTables = [];

		const tableWrapper = this.containerEl.ownerDocument.createElement("div");
		tableWrapper.className = "tn-bases-table-wrapper";
		tableWrapper.style.minWidth = this.getTableMinWidth(columns);
		const tableEl = this.createTable(entries, columns, false);
		this.renderedTables.push(tableEl);
		tableWrapper.appendChild(tableEl);
		this.tableScrollEl.appendChild(tableWrapper);
	}

	private renderGroupedNormal(groups: RenderableGroup[], columns: string[]): void {
		this.destroyVirtualScroller();
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
		this.ensureVirtualLayout("ungrouped", columns, entries, true);
		if (!this.virtualItemsHostEl) return;

		this.updateVirtualFooterSummary(entries, columns);

		if (!this.virtualScroller) {
			this.virtualScroller = new VirtualScroller<EntryLike>({
				container: this.virtualItemsHostEl,
				items: entries,
				overscan: this.VIRTUAL_OVERSCAN,
				renderItem: (entry) => this.createVirtualRow(entry, columns),
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
		this.ensureVirtualLayout("grouped", columns, menuEntries, false);
		if (!this.virtualItemsHostEl) return;

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
		virtualContainer.className = "tn-bases-table-wrapper tn-bases-table-virtual";
		virtualContainer.style.setProperty("--tn-table-columns-template", template);
		virtualContainer.style.setProperty("--tn-table-min-width", minWidth);
		virtualContainer.style.minWidth = minWidth;

		const headerRow = this.createVirtualHeaderRow(columns);
		virtualContainer.appendChild(headerRow);

		const viewport = doc.createElement("div");
		viewport.className = "tn-bases-table-virtual-viewport";
		virtualContainer.appendChild(viewport);

		const host = doc.createElement("div");
		host.className = "tn-bases-table-virtual-host";
		viewport.appendChild(host);

		let footerRow: HTMLElement | null = null;
		if (includeFooter) {
			footerRow = doc.createElement("div");
			footerRow.className = "tn-bases-table-summary-row tn-bases-table-summary-row--virtual";
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
			cell.className = "tn-bases-table-summary-cell";

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
		const doc = this.containerEl.ownerDocument;
		const row = doc.createElement("div");
		row.className = "tn-bases-table-header-row tn-bases-table-header-row--virtual";
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (let index = 0; index < columns.length; index++) {
			const propertyId = columns[index];
			const cell = doc.createElement("div");
			cell.className = "tn-bases-table-header-cell tn-bases-table-header-cell--virtual";
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

	private createVirtualRow(entry: EntryLike, columns: string[]): HTMLElement {
		const doc = this.containerEl.ownerDocument;
		const row = doc.createElement("div");
		row.className = "tn-bases-table-row tn-bases-table-row--virtual";
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (const propertyId of columns) {
			const cell = doc.createElement("div");
			cell.className = "tn-bases-table-cell";
			this.renderCell(cell, entry, propertyId);
			row.appendChild(cell);
		}

		return row;
	}

	private createVirtualGroupHeaderRow(
		item: Extract<VirtualGroupedItem<EntryLike>, { type: "group-header" }>
	): HTMLElement {
		const row = this.containerEl.ownerDocument.createElement("div");
		row.className = "tn-bases-table-group-title-row";
		row.style.minWidth = "var(--tn-table-min-width)";
		row.setText(`${item.title} (${item.count})`);
		return row;
	}

	private createVirtualGroupSummaryRow(
		item: Extract<VirtualGroupedItem<EntryLike>, { type: "group-summary" }>,
		columns: string[]
	): HTMLElement {
		const row = this.containerEl.ownerDocument.createElement("div");
		row.className = "tn-bases-table-summary-row tn-bases-table-summary-row--group tn-bases-table-summary-row--virtual";
		row.style.display = "grid";
		row.style.gridTemplateColumns = "var(--tn-table-columns-template)";
		row.style.minWidth = "var(--tn-table-min-width)";

		for (const propertyId of columns) {
			const cell = this.containerEl.ownerDocument.createElement("div");
			cell.className = "tn-bases-table-summary-cell";
			cell.setText(item.summaryValues[propertyId] || "");
			row.appendChild(cell);
		}

		return row;
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
		handle.className = "tn-bases-table-resize-handle";
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
		this.rootElement?.classList.add("tn-bases-table--resizing");

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
			this.rootElement?.classList.remove("tn-bases-table--resizing");
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
			console.error("[TaskNotes][CustomTableView] Failed to persist column sizes:", error);
		}
	}

	private renderGroupSection(groupTitle: string, entries: EntryLike[], columns: string[]): void {
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;

		const sectionEl = doc.createElement("section");
		sectionEl.className = "tn-bases-table-group";

		const titleEl = doc.createElement("h3");
		titleEl.className = "tn-bases-table-group-title";
		titleEl.setText(`${groupTitle} (${entries.length})`);
		sectionEl.appendChild(titleEl);

		const tableWrapper = doc.createElement("div");
		tableWrapper.className = "tn-bases-table-wrapper";
		tableWrapper.style.minWidth = this.getTableMinWidth(columns);
		const tableEl = this.createTable(entries, columns, true);
		this.renderedTables.push(tableEl);
		tableWrapper.appendChild(tableEl);
		sectionEl.appendChild(tableWrapper);

		this.tableScrollEl.appendChild(sectionEl);
	}

	private createTable(entries: EntryLike[], columns: string[], groupedSection: boolean): HTMLTableElement {
		const doc = this.containerEl.ownerDocument;
		const tableEl = doc.createElement("table");
		tableEl.className = "tn-bases-custom-table";
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
		headerRow.className = "tn-bases-table-header-row";

		for (let index = 0; index < columns.length; index++) {
			const propertyId = columns[index];
			const th = doc.createElement("th");
			th.className = "tn-bases-table-header-cell";
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
			row.className = "tn-bases-table-row";
			for (const propertyId of columns) {
				const td = row.insertCell();
				td.className = "tn-bases-table-cell";
				this.renderCell(td, entry, propertyId);
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
		wrapper.className = "tn-bases-table-header-label";

		const iconEl = doc.createElement("span");
		iconEl.className = "tn-bases-table-header-icon";
		iconEl.setAttribute("aria-hidden", "true");
		this.renderHeaderIcon(iconEl, propertyId);
		wrapper.appendChild(iconEl);

		const textEl = doc.createElement("span");
		textEl.className = "tn-bases-table-header-text";
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

	private resolvePropertyHeaderIcon(propertyId: string): string {
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
		const hasSummary = hasAnyTableSummary(columns, this.tableSummaries);
		if (!hasSummary) return;

		const row = sectionEl.insertRow();
		row.className = groupedSection
			? "tn-bases-table-summary-row tn-bases-table-summary-row--group"
			: "tn-bases-table-summary-row";

		for (const propertyId of columns) {
			const cell = groupedSection ? sectionEl.ownerDocument.createElement("td") : row.insertCell();
			cell.className = "tn-bases-table-summary-cell";
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
			console.error("[TaskNotes][CustomTableView] Failed to update table summary setting:", error);
			new Notice("Failed to update summary setting.");
		}
	}

	private renderCell(cellEl: HTMLElement, entry: EntryLike, propertyId: string): void {
		const value = this.safeGetValue(entry, propertyId);

		if (this.isFileNameColumn(propertyId)) {
			this.renderFileLink(cellEl, entry);
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

	private renderFileLink(cellEl: HTMLElement, entry: EntryLike): void {
		const filePath = entry.file?.path;
		const fileName = entry.file?.name || filePath;
		if (!filePath || !fileName) {
			cellEl.setText("");
			return;
		}

		const linkEl = this.containerEl.ownerDocument.createElement("a");
		linkEl.className = "tn-bases-table-file-link";
		linkEl.setText(fileName);
		linkEl.href = "#";

		linkEl.addEventListener("click", (evt) => {
			if (evt.button !== 0 && evt.button !== 1) return;
			evt.preventDefault();
			const modEvent = Keymap.isModEvent(evt);
			void (this.app || this.plugin.app).workspace.openLinkText(filePath, "", modEvent);
		});

		linkEl.addEventListener("mouseover", (evt) => {
			(this.app || this.plugin.app).workspace.trigger("hover-link", {
				event: evt,
				source: "tasknotes-bases-custom-table",
				hoverParent: this,
				targetEl: linkEl,
				linktext: filePath,
			});
		});

		cellEl.appendChild(linkEl);
	}

	private renderValue(cellEl: HTMLElement, value: any): void {
		if (value == null || (typeof value.isEmpty === "function" && value.isEmpty())) {
			cellEl.classList.add("tn-bases-table-cell--empty");
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
				console.debug("[TaskNotes][CustomTableView] value.renderTo failed; fallback to toString()", error);
			}
		}

		const textEl = this.containerEl.ownerDocument.createElement("span");
		textEl.className = "tn-bases-table-text-value";
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
		emptyEl.className = "tn-bases-empty";
		emptyEl.setText(message);
		this.tableScrollEl.appendChild(emptyEl);
	}

	renderError(error: Error): void {
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;
		const errorEl = doc.createElement("div");
		errorEl.className = "tn-bases-error";
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
	}

	protected async handleTaskUpdate(_task: TaskInfo): Promise<void> {
		this.debouncedRefresh();
	}
}

export function buildCustomTableViewFactory(plugin: TaskNotesPlugin) {
	return function (controller: any, containerEl: HTMLElement): CustomTableView {
		if (!containerEl) {
			console.error("[TaskNotes][CustomTableView] No containerEl provided");
			throw new Error("CustomTableView requires a containerEl");
		}
		return new CustomTableView(controller, containerEl, plugin);
	};
}
