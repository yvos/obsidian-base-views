import { Keymap, Menu, Notice } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { calculateSummary, getSummaryOptions, TableSummaryKey } from "./tableSummary";

type RowHeightOption = "short" | "medium" | "tall" | "extraTall";

const VALID_ROW_HEIGHTS: RowHeightOption[] = ["short", "medium", "tall", "extraTall"];

type EntryLike = {
	file?: {
		path?: string;
		name?: string;
	};
	getValue: (propertyId: string) => any;
};

export class CustomTableView extends BasesViewBase {
	type = "tasknotesCustomTable";

	private tableScrollEl: HTMLElement | null = null;
	private rowHeight: RowHeightOption = "medium";
	private tableSummaries: Record<string, TableSummaryKey> = {};
	private configLoaded = false;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);
		(this.dataAdapter as any).basesView = this;
	}

	onload(): void {
		this.readViewOptions();
		super.onload();
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

			this.configLoaded = true;
		} catch (error) {
			console.warn("[TaskNotes][CustomTableView] Failed to read view options:", error);
			this.rowHeight = "medium";
			this.tableSummaries = {};
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
		this.tableScrollEl.empty();

		if (!this.data?.data) {
			return;
		}

		const columns = this.getVisibleColumns();
		if (columns.length === 0) {
			this.renderEmptyState("No properties selected for this view.");
			return;
		}

		const groupedData = this.data?.groupedData || [];
		const isGrouped = this.dataAdapter.isGrouped();

		if (isGrouped) {
			let hasRenderedGroup = false;
			for (const group of groupedData) {
				const entries = (group?.entries || []) as EntryLike[];
				if (entries.length === 0) continue;
				hasRenderedGroup = true;
				this.renderGroupSection(group, entries, columns);
			}

			if (!hasRenderedGroup) {
				this.renderEmptyState("No rows match the current filters.");
			}
			return;
		}

		const entries = ((groupedData[0]?.entries || this.data?.data || []) as EntryLike[]);
		if (entries.length === 0) {
			this.renderEmptyState("No rows match the current filters.");
			return;
		}

		const tableWrapper = this.containerEl.ownerDocument.createElement("div");
		tableWrapper.className = "tn-bases-table-wrapper";
		tableWrapper.appendChild(this.createTable(entries, columns, false));
		this.tableScrollEl.appendChild(tableWrapper);
	}

	private renderGroupSection(group: any, entries: EntryLike[], columns: string[]): void {
		if (!this.tableScrollEl) return;
		const doc = this.containerEl.ownerDocument;

		const sectionEl = doc.createElement("section");
		sectionEl.className = "tn-bases-table-group";

		const titleEl = doc.createElement("h3");
		titleEl.className = "tn-bases-table-group-title";

		const groupName = this.dataAdapter.convertGroupKeyToString(group.key);
		titleEl.setText(`${groupName} (${entries.length})`);
		sectionEl.appendChild(titleEl);

		const tableWrapper = doc.createElement("div");
		tableWrapper.className = "tn-bases-table-wrapper";
		tableWrapper.appendChild(this.createTable(entries, columns, true));
		sectionEl.appendChild(tableWrapper);

		this.tableScrollEl.appendChild(sectionEl);
	}

	private createTable(entries: EntryLike[], columns: string[], groupedSection: boolean): HTMLTableElement {
		const doc = this.containerEl.ownerDocument;
		const tableEl = doc.createElement("table");
		tableEl.className = "tn-bases-custom-table";

		const theadEl = tableEl.createTHead();
		const headerRow = theadEl.insertRow();
		headerRow.className = "tn-bases-table-header-row";

		for (const propertyId of columns) {
			const th = doc.createElement("th");
			th.className = "tn-bases-table-header-cell";
			th.setText(this.config?.getDisplayName?.(propertyId) || propertyId);
			th.dataset.propertyId = propertyId;
			th.addEventListener("contextmenu", (event) =>
				this.showSummaryMenu(event as MouseEvent, propertyId, entries)
			);
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

		if (!groupedSection && columns.some((column) => !!this.tableSummaries[column])) {
			const tfootEl = tableEl.createTFoot();
			this.appendSummaryRow(tfootEl, entries, columns, false);
		}

		return tableEl;
	}

	private appendSummaryRow(
		sectionEl: HTMLTableSectionElement,
		entries: EntryLike[],
		columns: string[],
		groupedSection: boolean
	): void {
		const hasSummary = columns.some((column) => !!this.tableSummaries[column]);
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
			this.render();
		} catch (error) {
			console.error("[TaskNotes][CustomTableView] Failed to update table summary setting:", error);
			new Notice("Failed to update summary setting.");
		}
	}

	private renderCell(cellEl: HTMLTableCellElement, entry: EntryLike, propertyId: string): void {
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

		cellEl.setText(this.valueToString(value));
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
