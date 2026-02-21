/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Notice, TFile, setIcon } from "obsidian";
import TaskNotesPlugin from "../main";
import { BasesViewBase } from "./BasesViewBase";
import { TaskInfo } from "../types";
import { identifyTaskNotesFromBasesData, BasesDataItem } from "./helpers";
import { createTaskCard, showTaskContextMenu } from "../ui/TaskCard";
import { renderGroupTitle } from "./groupTitleRenderer";
import { type LinkServices } from "../ui/renderers/linkRenderer";
import { DateContextMenu } from "../components/DateContextMenu";
import { PriorityContextMenu } from "../components/PriorityContextMenu";
import { RecurrenceContextMenu } from "../components/RecurrenceContextMenu";
import { ReminderModal } from "../modals/ReminderModal";
import { getDatePart, getTimePart, parseDateToUTC, createUTCDateFromLocalCalendarDate } from "../utils/dateUtils";
import { VirtualScroller } from "../utils/VirtualScroller";
import {
	compareGroupKeys,
	extractGroupKeys,
	extractListValues,
	type GroupSortDirection,
} from "./customTableGrouping";
import {
	buildDuplicateNavigationIndex,
	createEmptyDuplicateNavigationIndex,
	getNextDuplicateRowOrder,
	hasDuplicateNavigationTarget,
	type DuplicateNavigationIndex,
} from "./customTableDuplicateNavigation";
import { openTaskNotesFile } from "../integrations/tasknotes/TaskNotesRuntimeBridge";

// Bases上でTaskNotesタスクのみをカード一覧表示するTask Listビュー本体。
export class TaskListViewCustom extends BasesViewBase {
	type = "tasknotesTaskListCustom";

	private itemsContainer: HTMLElement | null = null;
	private currentTaskElements = new Map<string, HTMLElement>();
	private lastRenderWasGrouped = false;
	private lastFlatPaths: string[] = [];
	private lastTaskSignatures = new Map<string, string>();
	private taskInfoCache = new Map<string, TaskInfo>();
	private clickTimeouts = new Map<string, number>();
	private currentTargetDate = createUTCDateFromLocalCalendarDate(new Date());
	private containerListenersRegistered = false;
	private virtualScroller: VirtualScroller<any> | null = null; // Can render TaskInfo or group headers
	private useVirtualScrolling = false;
	private collapsedGroups = new Set<string>(); // Track collapsed group keys
	private collapsedSubGroups = new Set<string>(); // Track collapsed sub-group keys
	private subGroupPropertyId: string | null = null; // Property ID for sub-grouping
	private unnestMultiValueGroup = true;
	private configLoaded = false; // Track if we've successfully loaded config
	private hasHandledFirstDataUpdate = false;
	private lastViewConfigSignature = "";
	private readonly NORMAL_UPDATE_DEBOUNCE_MS = 300;
	private duplicateNavigationIndex: DuplicateNavigationIndex =
		createEmptyDuplicateNavigationIndex();
	private rowOrderToVirtualIndex = new Map<number, number>();
	private basesController: any = null;
	private hasShownReadOnlyNotice = false;

	/**
	 * Threshold for enabling virtual scrolling in task list view.
	 * Virtual scrolling activates when total items (tasks + group headers) >= 100.
	 * Benefits: ~90% memory reduction, eliminates UI lag for large lists.
	 * Lower than KanbanView (30) because task cards are simpler/smaller.
	 */
	private readonly VIRTUAL_SCROLL_THRESHOLD = 100;

	constructor(controller: any, containerEl: HTMLElement, plugin: TaskNotesPlugin) {
		super(controller, containerEl, plugin);
		// BasesView now provides this.data, this.config, and this.app directly
		// Update the data adapter to use this BasesView instance
		(this.dataAdapter as any).basesView = this;
		this.basesController = controller;
	}

	/**
	 * Component lifecycle: Called when view is first loaded.
	 * Override from Component base class.
	 */
	onload(): void {
		// Read view options now that config is available
		this.readViewOptions();
		this.lastViewConfigSignature = this.buildViewConfigSignature();
		// Call parent onload which sets up container and listeners
		super.onload();
	}

	/**
	 * BasesView lifecycle: Called when Bases data/config changes.
	 * Config changes are rendered immediately; regular data churn is debounced.
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
			void this.render().catch((error) => {
				console.error(`[TaskNotes][${this.type}] Render error:`, error);
				this.renderError(error as Error);
			});
		}, delay);
	}

	private buildViewConfigSignature(): string {
		try {
			const order = JSON.stringify(this.config?.getOrder?.() ?? []);
			const sort = JSON.stringify(this.config?.getSort?.() ?? []);
			const subGroup = String(this.config?.getAsPropertyId?.("subGroup") ?? "");
			const unnest = String(this.config?.get?.("unnestMultiValueGroup") ?? true);
			const grouped = this.dataAdapter.isGrouped() ? "grouped" : "flat";
			const allowControllerGroupByFallback = grouped === "grouped";
			const primaryGroupBy = this.getPrimaryGroupByPropertyId(allowControllerGroupByFallback) ?? "";
			const primaryGroupDirection = this.getPrimaryGroupByDirection(allowControllerGroupByFallback);
			return `${order}|${sort}|${subGroup}|${unnest}|${primaryGroupBy}|${primaryGroupDirection}|${grouped}`;
		} catch {
			return "";
		}
	}

	/**
	 * Read view configuration options from BasesViewConfig.
	 */
	private readViewOptions(): void {
		// Guard: config may not be set yet if called too early
		if (!this.config || typeof this.config.get !== 'function') {
			console.debug('[TaskListViewCustom] Config not available yet in readViewOptions');
			return;
		}

		try {
			const subGroupValue = this.config.getAsPropertyId('subGroup');
			this.subGroupPropertyId =
				typeof subGroupValue === "string" && subGroupValue.trim().length > 0
					? subGroupValue.trim()
					: null;
			// Custom Task List does not expose the legacy search box toggle.
			this.enableSearch = false;
			const unnestValue = this.config.get('unnestMultiValueGroup');
			this.unnestMultiValueGroup = this.parseBooleanOption(unnestValue, true);
			// Mark config as successfully loaded
			this.configLoaded = true;
		} catch (e) {
			// Use defaults
			console.warn('[TaskListViewCustom] Failed to parse config:', e);
			this.subGroupPropertyId = null;
			this.unnestMultiValueGroup = true;
			this.enableSearch = false;
		}
	}

	private parseBooleanOption(value: unknown, fallback: boolean): boolean {
		if (typeof value === "boolean") return value;
		if (typeof value === "string") {
			const normalized = value.trim().toLowerCase();
			if (normalized === "true") return true;
			if (normalized === "false") return false;
		}
		return fallback;
	}

	private asNonEmptyString(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}

	protected setupContainer(): void {
		super.setupContainer();

		// Make rootElement fill its container and establish flex context
		if (this.rootElement) {
			this.rootElement.style.cssText = "display: flex; flex-direction: column; height: 100%;";
			this.rootElement.classList.add("tn-bases-tasknotes-list");
		}

		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;

		// Create items container
		const itemsContainer = doc.createElement("div");
		itemsContainer.className = "tn-bases-items-container";
		// Use flex: 1 to fill available space in the rootElement flex container
		// max-height: 100vh prevents unbounded growth when embedded in notes
		// overflow-y: auto provides scrolling when content exceeds available height
		itemsContainer.style.cssText = "margin-top: 12px; flex: 1; max-height: 100vh; overflow-y: auto; position: relative;";
		this.rootElement?.appendChild(itemsContainer);
		this.itemsContainer = itemsContainer;
		this.registerContainerListeners();
	}

	async render(): Promise<void> {
		if (!this.itemsContainer || !this.rootElement) return;

		// Always refresh options so config changes reflect without view switching.
		if (this.config) {
			this.readViewOptions();
		}

		// Now that config is loaded, setup search (idempotent: will only create once)
		if (this.rootElement) {
			this.setupSearch(this.rootElement);
		}

		try {
			// Skip rendering if we have no data yet (prevents flickering during data updates)
			if (!this.data?.data) {
				return;
			}

			// Extract data using adapter (adapter now uses this as basesView)
			const dataItems = this.dataAdapter.extractDataItems();

			// Compute Bases formulas for TaskNotes items
			await this.computeFormulas(dataItems);

			const taskNotesRuntime = this.getTaskNotesRuntimePlugin();
			const taskNotes = await identifyTaskNotesFromBasesData(
				dataItems,
				taskNotesRuntime ?? this.plugin
			);
			this.syncReadOnlyStateHint(taskNotesRuntime);

			if (taskNotes.length === 0) {
				this.clearAllTaskElements();
				this.renderEmptyState();
				this.lastRenderWasGrouped = false;
				return;
			}

			const isGrouped = this.dataAdapter.isGrouped();

			// Special case: if sub-grouping is configured but primary grouping is not,
			// treat sub-group property as primary grouping
			if (!isGrouped && this.subGroupPropertyId) {
				if (!this.lastRenderWasGrouped) {
					this.clearAllTaskElements();
				}
				await this.renderGroupedBySubProperty(taskNotes);
				this.lastRenderWasGrouped = true;
			} else if (isGrouped) {
				if (!this.lastRenderWasGrouped) {
					this.clearAllTaskElements();
				}
				await this.renderGrouped(taskNotes);
				this.lastRenderWasGrouped = true;
			} else {
				if (this.lastRenderWasGrouped) {
					this.clearAllTaskElements();
				}
				await this.renderFlat(taskNotes);
				this.lastRenderWasGrouped = false;
			}

			// Check if we have grouped data
		} catch (error: any) {
			console.error("[TaskNotes][TaskListViewCustom] Error rendering:", error);
			this.clearAllTaskElements();
			this.renderError(error);
		}
	}

	/**
	 * Compute Bases formulas for TaskNotes items.
	 * This ensures formulas have access to TaskNote-specific properties.
	 */
	private async computeFormulas(dataItems: BasesDataItem[]): Promise<void> {
		// Access formulas through the data context
		const ctxFormulas = (this.data as any)?.ctx?.formulas;
		if (!ctxFormulas || typeof ctxFormulas !== "object" || dataItems.length === 0) {
			return;
		}

		for (let i = 0; i < dataItems.length; i++) {
			const item = dataItems[i];
			const itemFormulaResults = item.basesData?.formulaResults;
			if (!itemFormulaResults?.cachedFormulaOutputs) continue;

			for (const formulaName of Object.keys(ctxFormulas)) {
				const formula = ctxFormulas[formulaName];
				if (formula && typeof formula.getValue === "function") {
					try {
						const baseData = item.basesData;
						const taskProperties = item.properties || {};

						let result;

						// Temporarily merge TaskNote properties into frontmatter for formula access
						if (baseData.frontmatter && Object.keys(taskProperties).length > 0) {
							const originalFrontmatter = baseData.frontmatter;
							baseData.frontmatter = {
								...originalFrontmatter,
								...taskProperties,
							};
							result = formula.getValue(baseData);
							baseData.frontmatter = originalFrontmatter; // Restore original state
						} else {
							result = formula.getValue(baseData);
						}

						// Store computed result for TaskCard rendering
						if (result !== undefined) {
							itemFormulaResults.cachedFormulaOutputs[formulaName] = result;
						}
					} catch (e) {
						// Formulas may fail for various reasons - this is expected
					}
				}
			}
		}
	}

	private async renderFlat(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();

		// Apply search filter
		const filteredTasks = this.applySearchFilter(taskNotes);

		// Show "no results" if search returned empty but we had tasks
		if (this.isSearchWithNoResults(filteredTasks, taskNotes.length)) {
			this.clearAllTaskElements();
			if (this.itemsContainer) {
				this.renderSearchNoResults(this.itemsContainer);
			}
			return;
		}

		// Note: taskNotes are already sorted by Bases according to sort configuration
		// No manual sorting needed - Bases provides pre-sorted data

		const targetDate = createUTCDateFromLocalCalendarDate(new Date());
		this.currentTargetDate = targetDate;

		const cardOptions = this.getCardOptions(targetDate);
		this.resetDuplicateNavigationState();

		// Decide whether to use virtual scrolling based on filtered task count
		const shouldUseVirtualScrolling = filteredTasks.length >= this.VIRTUAL_SCROLL_THRESHOLD;

		if (shouldUseVirtualScrolling && !this.useVirtualScrolling) {
			// Switch to virtual scrolling
			this.cleanupNonVirtualRendering();
			this.useVirtualScrolling = true;
		} else if (!shouldUseVirtualScrolling && this.useVirtualScrolling) {
			// Switch back to normal rendering
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}

		if (this.useVirtualScrolling) {
			await this.renderFlatVirtual(filteredTasks, visibleProperties, cardOptions);
		} else {
			await this.renderFlatNormal(filteredTasks, visibleProperties, cardOptions);
		}
	}

	private async renderFlatVirtual(
		taskNotes: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		if (!this.itemsContainer) return;

		if (!this.virtualScroller) {
			// Initialize virtual scroller with automatic height calculation
			this.virtualScroller = new VirtualScroller<TaskInfo>({
				container: this.itemsContainer,
				items: taskNotes,
				// itemHeight omitted - will be calculated automatically from sample
				overscan: 5,
				renderItem: (taskInfo: TaskInfo, index: number) => {
					// Create card using lazy mode
					const card = this.createTaskCardElement(taskInfo, visibleProperties, cardOptions);

					// Cache task info for event handlers
					this.taskInfoCache.set(taskInfo.path, taskInfo);
					this.lastTaskSignatures.set(taskInfo.path, this.buildTaskSignature(taskInfo));

					return card;
				},
				getItemKey: (taskInfo: TaskInfo) => taskInfo.path,
			});

			// Force recalculation after DOM settles
			setTimeout(() => {
				this.virtualScroller?.recalculate();
			}, 0);
		} else {
			// Update existing virtual scroller with new items
			this.virtualScroller.updateItems(taskNotes);
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private async renderFlatNormal(
		taskNotes: TaskInfo[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		if (!this.itemsContainer) return;

		const seenPaths = new Set<string>();
		const orderChanged = !this.arePathArraysEqual(taskNotes, this.lastFlatPaths);

		if (orderChanged) {
			this.itemsContainer.empty();
			this.currentTaskElements.clear();
		}

		for (const taskInfo of taskNotes) {
			let cardEl = orderChanged ? null : this.currentTaskElements.get(taskInfo.path) || null;
			const signature = this.buildTaskSignature(taskInfo);
			const previousSignature = this.lastTaskSignatures.get(taskInfo.path);
			const needsUpdate = signature !== previousSignature || !cardEl;

			if (!cardEl || needsUpdate) {
					const newCard = this.createTaskCardElement(
						taskInfo,
						visibleProperties,
						cardOptions
					);
				if (cardEl && cardEl.isConnected) {
					cardEl.replaceWith(newCard);
				}
				cardEl = newCard;
			}

			if (!cardEl!.isConnected) {
				this.itemsContainer!.appendChild(cardEl!);
			}

			this.currentTaskElements.set(taskInfo.path, cardEl!);
			this.taskInfoCache.set(taskInfo.path, taskInfo);
			this.lastTaskSignatures.set(taskInfo.path, signature);
			seenPaths.add(taskInfo.path);
		}

		if (!orderChanged && seenPaths.size !== this.currentTaskElements.size) {
			for (const [path, el] of this.currentTaskElements) {
				if (!seenPaths.has(path)) {
					el.remove();
					this.currentTaskElements.delete(path);

					// Clean up related state in the same pass
					const timeout = this.clickTimeouts.get(path);
					if (timeout) {
						clearTimeout(timeout);
						this.clickTimeouts.delete(path);
					}
					this.taskInfoCache.delete(path);
					this.lastTaskSignatures.delete(path);
				}
			}
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
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
					const direction = this.resolveGroupByDirectionFromValue(rawGroupBy);
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

	/**
	 * Resolve primary groups.
	 * Uses Bases groupedData by default, and rebuilds groups with unnest when primary groupBy is multi-value.
	 */
	private resolvePrimaryGroups(
		taskNotes: TaskInfo[]
	): Array<{ key: string; tasks: TaskInfo[] }> {
		const basesGroups = this.dataAdapter.getGroupedData();
		const taskByPath = new Map(taskNotes.map((task) => [task.path, task]));
		const groupedByBases: Array<{ key: string; tasks: TaskInfo[] }> = [];

		for (const group of basesGroups) {
			const key = this.dataAdapter.convertGroupKeyToString(group?.key);
			const tasks: TaskInfo[] = [];
			const seen = new Set<string>();
			const entries = Array.isArray(group?.entries) ? group.entries : [];
			for (const entry of entries) {
				const path = entry?.file?.path;
				if (typeof path !== "string" || seen.has(path)) continue;
				const task = taskByPath.get(path);
				if (!task) continue;
				seen.add(path);
				tasks.push(task);
			}
			if (tasks.length > 0) {
				groupedByBases.push({ key, tasks });
			}
		}

		const isGrouped = this.dataAdapter.isGrouped();
		const primaryGroupByPropertyId = this.getPrimaryGroupByPropertyId(isGrouped);
		if (!this.unnestMultiValueGroup || !primaryGroupByPropertyId) {
			return groupedByBases;
		}

		const pathToProps = this.buildPathToPropsMap();
		const pathToBasesEntry = this.buildPathToBasesEntryMap();
		const hasPrimaryMultiValue = taskNotes.some((task) => {
			const props = pathToProps.get(task.path) || {};
			const basesEntry = pathToBasesEntry.get(task.path);
			const value = this.getPropertyValue(props, primaryGroupByPropertyId, basesEntry);
			const listValues = extractListValues(value);
			return Array.isArray(listValues) && listValues.length > 1;
		});

		if (!hasPrimaryMultiValue) {
			return groupedByBases;
		}

		const grouped = new Map<string, TaskInfo[]>();
		for (const task of taskNotes) {
			const props = pathToProps.get(task.path) || {};
			const basesEntry = pathToBasesEntry.get(task.path);
			const value = this.getPropertyValue(props, primaryGroupByPropertyId, basesEntry);
			const keys = this.extractSubGroupKeys(value);
			const uniqueKeys = new Set(keys);

			for (const key of uniqueKeys) {
				if (!grouped.has(key)) {
					grouped.set(key, []);
				}
				grouped.get(key)!.push(task);
			}
		}

		const direction = this.getPrimaryGroupByDirection(isGrouped);
		const sortedKeys = Array.from(grouped.keys()).sort((left, right) =>
			compareGroupKeys(left, right, direction)
		);
		return sortedKeys.map((key) => ({
			key,
			tasks: grouped.get(key) ?? [],
		}));
	}

	/**
	 * Build flattened list of render items (headers + tasks) for grouped view
	 * Shared between renderGrouped() and refreshGroupedView()
	 */
	private buildGroupedRenderItems(
		primaryGroups: Array<{ key: string; tasks: TaskInfo[] }>
	): any[] {
		type RenderItem =
			| { type: 'primary-header'; groupKey: string; groupTitle: string; taskCount: number; groupEntries: any[]; isCollapsed: boolean }
			| { type: 'sub-header'; groupKey: string; subGroupKey: string; subGroupTitle: string; taskCount: number; isCollapsed: boolean; parentKey: string }
			| { type: 'task'; task: TaskInfo; groupKey: string; rowOrder: number; subGroupKey?: string };

		const items: RenderItem[] = [];
		let rowOrder = 0;

		// Build property map for sub-grouping if needed
		const pathToProps = this.subGroupPropertyId ? this.buildPathToPropsMap() : new Map();
		const pathToBasesEntry = this.subGroupPropertyId ? this.buildPathToBasesEntryMap() : new Map();

		for (const group of primaryGroups) {
			const primaryKey = group.key;
			const groupTasks = group.tasks;

			// Skip groups with no matching tasks (e.g., after search filtering)
			if (groupTasks.length === 0) continue;

			const isPrimaryCollapsed = this.collapsedGroups.has(primaryKey);

			// Add primary header
			items.push({
				type: 'primary-header',
				groupKey: primaryKey,
				groupTitle: primaryKey,
				taskCount: groupTasks.length,
				groupEntries: [],
				isCollapsed: isPrimaryCollapsed
			});

			// If primary group is not collapsed, add sub-groups or tasks
			if (!isPrimaryCollapsed) {
				if (this.subGroupPropertyId) {
					// Sub-grouping enabled: create nested structure
					const subGroups = this.groupTasksBySubProperty(
						groupTasks,
						this.subGroupPropertyId,
						pathToProps,
						pathToBasesEntry
					);

					for (const [subKey, subTasks] of subGroups) {
						// Filter out empty sub-groups
						if (subTasks.length === 0) continue;

						const compoundKey = `${primaryKey}:${subKey}`;
						const isSubCollapsed = this.collapsedSubGroups.has(compoundKey);

						// Add sub-header
						items.push({
							type: 'sub-header',
							groupKey: primaryKey,
							subGroupKey: subKey,
							subGroupTitle: subKey,
							taskCount: subTasks.length,
							isCollapsed: isSubCollapsed,
							parentKey: primaryKey
						});

						// Add tasks if sub-group is not collapsed
						if (!isSubCollapsed) {
							for (const task of subTasks) {
								items.push({
									type: 'task',
									task,
									groupKey: primaryKey,
									subGroupKey: subKey,
									rowOrder: rowOrder++,
								});
							}
						}
					}
				} else {
					// No sub-grouping: add tasks directly
					for (const task of groupTasks) {
						items.push({ type: 'task', task, groupKey: primaryKey, rowOrder: rowOrder++ });
					}
				}
			}
		}

		return items;
	}

	/**
	 * Render tasks grouped by sub-property (when no primary grouping is configured).
	 * This treats the sub-group property as primary grouping.
	 */
	private async renderGroupedBySubProperty(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();

		// Apply search filter
		const filteredTasks = this.applySearchFilter(taskNotes);

		// Show "no results" if search returned empty but we had tasks
		if (this.isSearchWithNoResults(filteredTasks, taskNotes.length)) {
			this.clearAllTaskElements();
			if (this.itemsContainer) {
				this.renderSearchNoResults(this.itemsContainer);
			}
			return;
		}

		const targetDate = createUTCDateFromLocalCalendarDate(new Date());
		this.currentTargetDate = targetDate;
		const cardOptions = this.getCardOptions(targetDate);

		// Group tasks by sub-property
		const pathToProps = this.buildPathToPropsMap();
		const pathToBasesEntry = this.buildPathToBasesEntryMap();
		const groupedTasks = this.groupTasksBySubProperty(
			filteredTasks,
			this.subGroupPropertyId!,
			pathToProps,
			pathToBasesEntry
		);

		// Build flat items array (treat sub-groups as primary groups)
		type RenderItem =
			| { type: 'primary-header'; groupKey: string; groupTitle: string; taskCount: number; groupEntries: any[]; isCollapsed: boolean }
			| { type: 'task'; task: TaskInfo; groupKey: string; rowOrder: number };

		const items: RenderItem[] = [];
		let rowOrder = 0;
		for (const [groupKey, tasks] of groupedTasks) {
			// Skip empty groups
			if (tasks.length === 0) continue;

			const isCollapsed = this.collapsedGroups.has(groupKey);

			items.push({
				type: 'primary-header',
				groupKey,
				groupTitle: groupKey,
				taskCount: tasks.length,
				groupEntries: [], // No group entries from Bases
				isCollapsed
			});

			if (!isCollapsed) {
				for (const task of tasks) {
					items.push({ type: 'task', task, groupKey, rowOrder: rowOrder++ });
				}
			}
		}

		this.rebuildDuplicateNavigationState(items);

		// Decide whether to use virtual scrolling
		const shouldUseVirtualScrolling = items.length >= this.VIRTUAL_SCROLL_THRESHOLD;

		// Switch rendering mode if needed
		if (this.useVirtualScrolling && shouldUseVirtualScrolling && this.virtualScroller) {
			this.virtualScroller.updateItems(items);
			this.lastFlatPaths = taskNotes.map((task) => task.path);
			return;
		}

		// Full render needed
		this.itemsContainer!.empty();
		this.currentTaskElements.clear();
		this.clearClickTimeouts();
		this.taskInfoCache.clear();
		this.lastTaskSignatures.clear();

		if (shouldUseVirtualScrolling && !this.useVirtualScrolling) {
			this.cleanupNonVirtualRendering();
			this.useVirtualScrolling = true;
		} else if (!shouldUseVirtualScrolling && this.useVirtualScrolling) {
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}

		if (this.useVirtualScrolling) {
			await this.renderGroupedVirtual(items, visibleProperties, cardOptions);
		} else {
			await this.renderGroupedNormal(items, visibleProperties, cardOptions);
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private async renderGrouped(taskNotes: TaskInfo[]): Promise<void> {
		const visibleProperties = this.getVisibleProperties();

		// Apply search filter
		const filteredTasks = this.applySearchFilter(taskNotes);

		// Show "no results" if search returned empty but we had tasks
		if (this.isSearchWithNoResults(filteredTasks, taskNotes.length)) {
			this.clearAllTaskElements();
			if (this.itemsContainer) {
				this.renderSearchNoResults(this.itemsContainer);
			}
			return;
		}

		const targetDate = createUTCDateFromLocalCalendarDate(new Date());
		this.currentTargetDate = targetDate;
		const cardOptions = this.getCardOptions(targetDate);

		// Build flattened list of items using shared method
		const primaryGroups = this.resolvePrimaryGroups(filteredTasks);
		const items = this.buildGroupedRenderItems(primaryGroups);
		this.rebuildDuplicateNavigationState(items);

		// Use virtual scrolling if we have many items
		const shouldUseVirtualScrolling = items.length >= this.VIRTUAL_SCROLL_THRESHOLD;

		// If already using virtual scrolling and still need it, just update items
		if (this.useVirtualScrolling && shouldUseVirtualScrolling && this.virtualScroller) {
			this.virtualScroller.updateItems(items);
			this.lastFlatPaths = taskNotes.map((task) => task.path);
			return;
		}

		// Otherwise, need to switch rendering mode or initial render
		this.itemsContainer!.empty();
		this.currentTaskElements.clear();
		this.clearClickTimeouts();
		this.taskInfoCache.clear();
		this.lastTaskSignatures.clear();

		if (shouldUseVirtualScrolling && !this.useVirtualScrolling) {
			this.cleanupNonVirtualRendering();
			this.useVirtualScrolling = true;
		} else if (!shouldUseVirtualScrolling && this.useVirtualScrolling) {
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}

		if (this.useVirtualScrolling) {
			await this.renderGroupedVirtual(items, visibleProperties, cardOptions);
		} else {
			await this.renderGroupedNormal(items, visibleProperties, cardOptions);
		}

		this.lastFlatPaths = taskNotes.map((task) => task.path);
	}

	private async renderGroupedVirtual(
		items: any[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		if (!this.virtualScroller) {
			this.virtualScroller = new VirtualScroller<any>({
				container: this.itemsContainer!,
				items: items,
				// itemHeight omitted - automatically calculated from sample (headers + cards)
				overscan: 5,
				renderItem: (item: any) => {
					if (item.type === 'primary-header' || item.type === 'sub-header') {
						return this.createGroupHeader(item);
					} else {
							const cardEl = this.createTaskCardElement(
								item.task,
								visibleProperties,
								cardOptions
							);
						this.decorateGroupedTaskCard(cardEl, item);
						this.taskInfoCache.set(item.task.path, item.task);
						this.lastTaskSignatures.set(item.task.path, this.buildTaskSignature(item.task));
						return cardEl;
					}
				},
				getItemKey: (item: any) => {
					if (item.type === 'primary-header') {
						return `primary-${item.groupKey}`;
					} else if (item.type === 'sub-header') {
						return `sub-${item.groupKey}:${item.subGroupKey}`;
					} else {
						return `task-${item.task.path}:${item.rowOrder ?? 0}`;
					}
				},
			});

			setTimeout(() => {
				this.virtualScroller?.recalculate();
			}, 0);
		} else {
			this.virtualScroller.updateItems(items);
		}
	}

	private async renderGroupedNormal(
		items: any[],
		visibleProperties: string[] | undefined,
		cardOptions: any
	): Promise<void> {
		for (const item of items) {
			if (item.type === 'primary-header' || item.type === 'sub-header') {
				const headerEl = this.createGroupHeader(item);
				this.itemsContainer!.appendChild(headerEl);
			} else {
				const cardEl = this.createTaskCardElement(
					item.task,
					visibleProperties,
					cardOptions
				);
				this.decorateGroupedTaskCard(cardEl, item);
				this.itemsContainer!.appendChild(cardEl);
				this.currentTaskElements.set(item.task.path, cardEl);
				this.taskInfoCache.set(item.task.path, item.task);
				this.lastTaskSignatures.set(item.task.path, this.buildTaskSignature(item.task));
			}
		}
	}

	private decorateGroupedTaskCard(
		cardEl: HTMLElement,
		item: { task: TaskInfo; rowOrder?: number; subGroupKey?: string }
	): void {
		if (typeof item.rowOrder === "number") {
			cardEl.dataset.tnRowOrder = String(item.rowOrder);
		}

		if (item.subGroupKey) {
			cardEl.classList.add("tn-task-list-custom-subgroup-item");
		}

		if (!this.unnestMultiValueGroup || typeof item.rowOrder !== "number") {
			return;
		}
		if (!hasDuplicateNavigationTarget(this.duplicateNavigationIndex, item.task.path)) {
			return;
		}

		const titleEl = cardEl.querySelector<HTMLElement>(".task-card__title");
		if (!titleEl) return;

		const jumpButton = titleEl.ownerDocument.createElement("button");
		jumpButton.type = "button";
		jumpButton.className = "tn-task-list-custom-duplicate-jump";
		jumpButton.setAttribute("aria-label", "Jump to next duplicated row");
		setIcon(jumpButton, "git-branch");

		this.registerDomEvent(jumpButton, "click", (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			this.jumpToNextDuplicateRow(item.task.path, item.rowOrder!);
		});

		titleEl.appendChild(jumpButton);
	}

	private jumpToNextDuplicateRow(filePath: string, currentRowOrder: number): void {
		const nextRowOrder = getNextDuplicateRowOrder(
			this.duplicateNavigationIndex,
			filePath,
			currentRowOrder
		);
		if (nextRowOrder == null) return;

		if (this.useVirtualScrolling && this.virtualScroller) {
			const targetIndex = this.rowOrderToVirtualIndex.get(nextRowOrder);
			if (typeof targetIndex === "number") {
				this.virtualScroller.scrollToIndex(targetIndex, "auto", 150);
			}
			return;
		}

		const targetCard = this.itemsContainer?.querySelector<HTMLElement>(
			`.task-card[data-tn-row-order="${nextRowOrder}"]`
		);
		if (!targetCard) return;

		targetCard.scrollIntoView({ block: "center", behavior: "smooth" });
	}

	private resetDuplicateNavigationState(): void {
		this.duplicateNavigationIndex = createEmptyDuplicateNavigationIndex();
		this.rowOrderToVirtualIndex.clear();
	}

	private rebuildDuplicateNavigationState(items: any[]): void {
		const rowPaths: string[] = [];
		this.rowOrderToVirtualIndex.clear();

		for (let virtualIndex = 0; virtualIndex < items.length; virtualIndex++) {
			const item = items[virtualIndex];
			if (item?.type !== "task") continue;
			if (typeof item.rowOrder !== "number") continue;
			rowPaths[item.rowOrder] = item.task?.path ?? "";
			this.rowOrderToVirtualIndex.set(item.rowOrder, virtualIndex);
		}

		this.duplicateNavigationIndex = buildDuplicateNavigationIndex(rowPaths);
	}

	private createGroupHeader(headerItem: any): HTMLElement {
		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;

		const groupHeader = doc.createElement("div");
		groupHeader.className = "task-section task-group";

		// Determine header level and set appropriate data attributes
		const isSubHeader = headerItem.type === 'sub-header';
		const level = isSubHeader ? 'sub' : 'primary';
		groupHeader.dataset.level = level;

		if (isSubHeader) {
			groupHeader.dataset.groupKey = `${headerItem.groupKey}:${headerItem.subGroupKey}`;
			groupHeader.dataset.parentKey = headerItem.parentKey;
		} else {
			groupHeader.dataset.groupKey = headerItem.groupKey;
		}

		// Apply collapsed state
		if (headerItem.isCollapsed) {
			groupHeader.classList.add("is-collapsed");
		}

		const headerElement = doc.createElement("h3");
		headerElement.className = "task-group-header task-list-view__group-header";
		groupHeader.appendChild(headerElement);

		// Add toggle button
		const toggleBtn = doc.createElement("button");
		toggleBtn.className = "task-group-toggle";
		toggleBtn.setAttribute("aria-label", "Toggle group");
		toggleBtn.setAttribute("aria-expanded", String(!headerItem.isCollapsed));
		toggleBtn.dataset.groupKey = groupHeader.dataset.groupKey!;
		headerElement.appendChild(toggleBtn);

		// Add chevron icon
		setIcon(toggleBtn, "chevron-right");
		const svg = toggleBtn.querySelector("svg");
		if (svg) {
			svg.classList.add("chevron");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
		}

		// Add group title
		const titleContainer = headerElement.createSpan({ cls: "task-group-title" });
		const displayTitle = isSubHeader ? headerItem.subGroupTitle : headerItem.groupTitle;
		this.renderGroupTitle(titleContainer, displayTitle);

		// Add count
		headerElement.createSpan({
			text: ` (${headerItem.taskCount})`,
			cls: "agenda-view__item-count",
		});

		return groupHeader;
	}

	protected async handleTaskUpdate(task: TaskInfo): Promise<void> {
		// Update cache
		this.taskInfoCache.set(task.path, task);
		this.lastTaskSignatures.set(task.path, this.buildTaskSignature(task));

		// Grouped mode keeps duplicate row state and row-order metadata; refresh as a whole.
		if (this.lastRenderWasGrouped) {
			this.debouncedRefresh();
			return;
		}

		// For virtual scrolling, just do a full refresh
		// Simple and reliable, performance is still good with virtual scrolling
		if (this.useVirtualScrolling) {
			this.debouncedRefresh();
		} else {
			// Normal mode - update the specific card
			const existingElement = this.currentTaskElements.get(task.path);
			if (existingElement && existingElement.isConnected) {
				const visibleProperties = this.getVisibleProperties();
				const replacement = this.createTaskCardElement(
					task,
					visibleProperties,
					this.getCardOptions(this.currentTargetDate)
				);
				existingElement.replaceWith(replacement);
				replacement.classList.add("task-card--updated");
				// Use correct window for pop-out window support
				const win = this.containerEl.ownerDocument.defaultView || window;
				win.setTimeout(() => {
					replacement.classList.remove("task-card--updated");
				}, 1000);
				this.currentTaskElements.set(task.path, replacement);
			} else {
				this.debouncedRefresh();
			}
		}
	}

	private renderEmptyState(): void {
		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;
		const emptyEl = doc.createElement("div");
		emptyEl.className = "tn-bases-empty";
		emptyEl.style.cssText = "padding: 20px; text-align: center; color: #666;";
		emptyEl.textContent = "No TaskNotes tasks found for this Base.";
		this.itemsContainer!.appendChild(emptyEl);
	}

	renderError(error: Error): void {
		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;
		const errorEl = doc.createElement("div");
		errorEl.className = "tn-bases-error";
		errorEl.style.cssText =
			"padding: 20px; color: #d73a49; background: #ffeaea; border-radius: 4px; margin: 10px 0;";
		errorEl.textContent = `Error loading tasks: ${error.message || "Unknown error"}`;
		this.itemsContainer!.appendChild(errorEl);
	}

	/**
	 * Render group title using shared utility.
	 * Uses this.app from BasesView (with fallback to plugin.app for safety).
	 */
	private renderGroupTitle(container: HTMLElement, title: string): void {
		// Use this.app if available (set by Bases), otherwise fall back to plugin.app
		const app = this.app || this.plugin.app;

		const linkServices: LinkServices = {
			metadataCache: app.metadataCache,
			workspace: app.workspace,
		};

		renderGroupTitle(container, title, linkServices);
	}

	/**
	 * Component lifecycle: Called when component is unloaded.
	 * Override from Component base class.
	 */
	onunload(): void {
		// Component.register() calls will be automatically cleaned up (including search cleanup)
		// We just need to clean up view-specific state
		this.unregisterContainerListeners();
		this.destroyVirtualScroller();

		this.currentTaskElements.clear();
		this.itemsContainer = null;
		this.lastRenderWasGrouped = false;
		this.clearClickTimeouts();
		this.taskInfoCache.clear();
		this.lastTaskSignatures.clear();
		this.lastFlatPaths = [];
		this.useVirtualScrolling = false;
		this.collapsedGroups.clear();
		this.collapsedSubGroups.clear();
		this.hasHandledFirstDataUpdate = false;
		this.lastViewConfigSignature = "";
		this.configLoaded = false;
		this.resetDuplicateNavigationState();
	}

	/**
	 * Get ephemeral state to preserve across view reloads.
	 * Saves scroll position, collapsed groups, and collapsed sub-groups.
	 */
	getEphemeralState(): any {
		return {
			scrollTop: this.rootElement?.scrollTop || 0,
			collapsedGroups: Array.from(this.collapsedGroups),
			collapsedSubGroups: Array.from(this.collapsedSubGroups),
		};
	}

	/**
	 * Restore ephemeral state after view reload.
	 * Restores scroll position, collapsed groups, and collapsed sub-groups.
	 */
	setEphemeralState(state: any): void {
		if (!state) return;

		// Restore collapsed groups immediately
		if (state.collapsedGroups && Array.isArray(state.collapsedGroups)) {
			this.collapsedGroups = new Set(state.collapsedGroups);
		}

		// Restore collapsed sub-groups immediately
		if (state.collapsedSubGroups && Array.isArray(state.collapsedSubGroups)) {
			this.collapsedSubGroups = new Set(state.collapsedSubGroups);
		}

		// Restore scroll position after render completes
		if (state.scrollTop !== undefined && this.rootElement) {
			// Use requestAnimationFrame to ensure DOM is ready
			requestAnimationFrame(() => {
				if (this.rootElement && this.rootElement.isConnected) {
					this.rootElement.scrollTop = state.scrollTop;
				}
			});
		}
	}

	private clearAllTaskElements(): void {
		if (this.useVirtualScrolling) {
			this.destroyVirtualScroller();
			this.useVirtualScrolling = false;
		}
		this.itemsContainer?.empty();
		this.currentTaskElements.forEach((el) => el.remove());
		this.currentTaskElements.clear();
		this.lastFlatPaths = [];
		this.lastTaskSignatures.clear();
		this.taskInfoCache.clear();
		this.clearClickTimeouts();
		this.resetDuplicateNavigationState();
	}

	private getCardOptions(targetDate: Date) {
		return {
			targetDate,
		};
	}

	private getTaskNotesRuntimePlugin(): any | null {
		const resolver = (this.plugin as unknown as { getTaskNotesRuntime?: () => unknown })
			.getTaskNotesRuntime;
		if (typeof resolver !== "function") return null;
		try {
			const runtime = resolver.call(this.plugin);
			return runtime && typeof runtime === "object" ? runtime : null;
		} catch {
			return null;
		}
	}

	private syncReadOnlyStateHint(runtimePlugin: any | null): void {
		if (!this.rootElement) return;
		const hintClass = "tn-task-list-custom-runtime-hint";
		const existing = this.rootElement.querySelector<HTMLElement>(`.${hintClass}`);

		if (runtimePlugin) {
			existing?.remove();
			return;
		}

		if (!existing) {
			const hint = this.rootElement.ownerDocument.createElement("div");
			hint.className = hintClass;
			hint.textContent = this.translateWithFallback(
				"views.taskListCustom.readOnlyHint",
				"Task List View (Custom): read-only mode (TaskNotes plugin is not enabled)."
			);
			this.rootElement.prepend(hint);
		}

		if (!this.hasShownReadOnlyNotice) {
			this.hasShownReadOnlyNotice = true;
			new Notice(
				this.translateWithFallback(
					"views.taskListCustom.readOnlyNotice",
					"Task List View (Custom) is running in read-only mode."
				)
			);
		}
	}

	private translateWithFallback(
		key: string,
		fallback: string,
		params?: Record<string, string | number>
	): string {
		const translated = this.plugin.i18n?.translate(key, params);
		if (translated && translated !== key) {
			return translated;
		}
		return fallback;
	}

	private createTaskCardElement(
		task: TaskInfo,
		visibleProperties: string[] | undefined,
		cardOptions: any
	): HTMLElement {
		const runtimePlugin = this.getTaskNotesRuntimePlugin();
		if (runtimePlugin) {
			return createTaskCard(task, runtimePlugin, visibleProperties, cardOptions);
		}
		return this.createReadOnlyTaskCard(task);
	}

	private createReadOnlyTaskCard(task: TaskInfo): HTMLElement {
		const doc = this.containerEl.ownerDocument;
		const card = doc.createElement("article");
		card.className = "task-card task-card--readonly tn-task-list-custom-readonly-card";
		card.dataset.taskPath = task.path;

		const mainRow = doc.createElement("div");
		mainRow.className = "task-card__main-row";

		const title = doc.createElement("div");
		title.className = "task-card__title";
		title.textContent = task.title || task.path.split("/").pop() || task.path;
		mainRow.appendChild(title);

		if (task.path) {
			const pathRow = doc.createElement("div");
			pathRow.className = "task-card__details";
			pathRow.textContent = task.path;
			mainRow.appendChild(pathRow);
		}

		card.appendChild(mainRow);

		const handleOpen = async (event: MouseEvent, newTab: boolean) => {
			event.preventDefault();
			event.stopPropagation();
			const app = this.app || this.plugin.app;
			const opened = await openTaskNotesFile(app, task.path, newTab);
			if (!opened) {
				new Notice(`File not found: ${task.path}`);
			}
		};

		card.addEventListener("click", (event) => {
			const mouseEvent = event as MouseEvent;
			void handleOpen(mouseEvent, mouseEvent.ctrlKey || mouseEvent.metaKey);
		});

		card.addEventListener("auxclick", (event) => {
			const mouseEvent = event as MouseEvent;
			if (mouseEvent.button === 1) {
				void handleOpen(mouseEvent, true);
			}
		});

		return card;
	}

	private clearClickTimeouts(): void {
		for (const timeout of this.clickTimeouts.values()) {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
		this.clickTimeouts.clear();
	}

	private registerContainerListeners(): void {
		if (!this.itemsContainer || this.containerListenersRegistered) return;

		// Register click listener for group header collapse/expand using Component API
		// This automatically cleans up on component unload
		this.registerDomEvent(this.itemsContainer, "click", this.handleItemClick);
		this.containerListenersRegistered = true;
	}

	private unregisterContainerListeners(): void {
		// No manual cleanup needed - Component.registerDomEvent handles it automatically
		this.containerListenersRegistered = false;
	}

	private getTaskContextFromEvent(event: Event): { task: TaskInfo; card: HTMLElement } | null {
		const target = event.target as HTMLElement | null;
		if (!target) return null;
		const card = target.closest<HTMLElement>(".task-card");
		if (!card) return null;
		const path = card.dataset.taskPath;
		if (!path) return null;
		const task = this.taskInfoCache.get(path);
		if (!task) return null;
		return { task, card };
	}

	private handleItemClick = async (event: MouseEvent) => {
		const target = event.target as HTMLElement;

		// ONLY handle group header clicks - task cards handle their own clicks
		const groupHeader = target.closest<HTMLElement>(".task-group-header");
		if (groupHeader) {
			const groupSection = groupHeader.closest<HTMLElement>(".task-group");
			const groupKey = groupSection?.dataset.groupKey;

			if (groupKey) {
				// Don't toggle if clicking on a link
				if (target.closest("a")) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();
				await this.handleGroupToggle(groupKey);
				return;
			}
		}

		// Don't handle task card clicks here - they have their own handlers
		// This prevents double-firing when clicking on tasks
	};

	private async handleGroupToggle(groupKey: string): Promise<void> {
		// Detect if this is a sub-group toggle (compound key contains colon)
		const isSubGroup = groupKey.includes(':');

		if (isSubGroup) {
			// Toggle sub-group collapsed state
			if (this.collapsedSubGroups.has(groupKey)) {
				this.collapsedSubGroups.delete(groupKey);
			} else {
				this.collapsedSubGroups.add(groupKey);
			}
		} else {
			// Toggle primary group collapsed state
			if (this.collapsedGroups.has(groupKey)) {
				this.collapsedGroups.delete(groupKey);
			} else {
				this.collapsedGroups.add(groupKey);
			}
		}

		// Rebuild items and update virtual scroller without full re-render
		if (this.lastRenderWasGrouped) {
			await this.refreshGroupedView();
		}
	}

	private async refreshGroupedView(): Promise<void> {
		if (!this.data?.data) return;

		const dataItems = this.dataAdapter.extractDataItems();
		await this.computeFormulas(dataItems);
		const taskNotesRuntime = this.getTaskNotesRuntimePlugin();
		const taskNotes = await identifyTaskNotesFromBasesData(
			dataItems,
			taskNotesRuntime ?? this.plugin
		);
		const filteredTasks = this.applySearchFilter(taskNotes);

		// Build flattened list of items using shared method
		const primaryGroups = this.resolvePrimaryGroups(filteredTasks);
		const items = this.buildGroupedRenderItems(primaryGroups);
		this.rebuildDuplicateNavigationState(items);

		// Update virtual scroller with new items
		if (this.useVirtualScrolling && this.virtualScroller) {
			this.virtualScroller.updateItems(items);
		} else {
			// If not using virtual scrolling, do full render
			await this.render();
		}
	}

	private handleItemContextMenu = async (event: MouseEvent) => {
		const context = this.getTaskContextFromEvent(event);
		if (!context) return;
		event.preventDefault();
		event.stopPropagation();

		// If multiple tasks are selected, show batch context menu
		const selectionService = this.plugin.taskSelectionService;
		if (selectionService && selectionService.getSelectionCount() > 1) {
			// Ensure the right-clicked task is in the selection
			if (!selectionService.isSelected(context.task.path)) {
				selectionService.addToSelection(context.task.path);
			}
			this.showBatchContextMenu(event);
			return;
		}

		await showTaskContextMenu(event, context.task.path, this.plugin, this.currentTargetDate);
	};

	private handleItemPointerOver = (event: PointerEvent) => {
		if ("pointerType" in event && event.pointerType !== "mouse") {
			return;
		}
		const context = this.getTaskContextFromEvent(event);
		if (!context) return;

		const related = event.relatedTarget as HTMLElement | null;
		if (related && context.card.contains(related)) {
			return;
		}

		const app = this.app || this.plugin.app;
		const file = app.vault.getAbstractFileByPath(context.task.path);
		if (file) {
			app.workspace.trigger("hover-link", {
				event: event as MouseEvent,
				source: "tasknotes-task-card",
				hoverParent: context.card,
				targetEl: context.card,
				linktext: context.task.path,
				sourcePath: context.task.path,
			});
		}
	};

	private async handleActionClick(
		action: string,
		task: TaskInfo,
		target: HTMLElement,
		event: MouseEvent
	): Promise<void> {
		switch (action) {
			case "toggle-status":
				await this.handleToggleStatus(task, event);
				return;
			case "priority-menu":
				this.showPriorityMenu(task, event);
				return;
			case "recurrence-menu":
				this.showRecurrenceMenu(task, event);
				return;
			case "reminder-menu":
				this.showReminderModal(task);
				return;
			case "task-context-menu":
				await showTaskContextMenu(event, task.path, this.plugin, this.getTaskActionDate(task));
				return;
			case "edit-date":
				await this.openDateContextMenu(task, target.dataset.tnDateType as "due" | "scheduled" | undefined, event);
				return;
			case "filter-project-subtasks":
				await this.filterProjectSubtasks(task);
				return;
			case "toggle-subtasks":
				await this.toggleSubtasks(task, target);
				return;
			case "toggle-blocking-tasks":
				await this.toggleBlockingTasks(task, target);
				return;
			default:
				await this.handleCardClick(task, event);
		}
	}

	private async handleToggleStatus(task: TaskInfo, event: MouseEvent): Promise<void> {
		try {
			if (task.recurrence) {
				const actionDate = this.getTaskActionDate(task);
				await this.plugin.toggleRecurringTaskComplete(task, actionDate);
			} else {
				await this.plugin.toggleTaskStatus(task);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error("[TaskNotes][TaskListViewCustom] Failed to toggle status", {
				error: message,
				taskPath: task.path,
			});
			new Notice(`Failed to toggle task status: ${message}`);
		}
	}

	/**
	 * Determine the date to use when completing a recurring task from Bases.
	 * Prefers the task's scheduled (or due) date to avoid marking the wrong instance.
	 */
	private getTaskActionDate(task: TaskInfo): Date {
		const dateStr = getDatePart(task.scheduled || task.due || "");
		if (dateStr) {
			return parseDateToUTC(dateStr);
		}

		return this.currentTargetDate;
	}

	private showPriorityMenu(task: TaskInfo, event: MouseEvent): void {
		const menu = new PriorityContextMenu({
			currentValue: task.priority,
			onSelect: async (newPriority) => {
				try {
					await this.plugin.updateTaskProperty(task, "priority", newPriority);
				} catch (error) {
					console.error("[TaskNotes][TaskListViewCustom] Failed to update priority", error);
					new Notice("Failed to update priority");
				}
			},
			plugin: this.plugin,
		});
		menu.show(event);
	}

	private showRecurrenceMenu(task: TaskInfo, event: MouseEvent): void {
		const menu = new RecurrenceContextMenu({
			currentValue: typeof task.recurrence === "string" ? task.recurrence : undefined,
			currentAnchor: task.recurrence_anchor || 'scheduled',
			onSelect: async (newRecurrence: string | null, anchor?: 'scheduled' | 'completion') => {
				try {
					await this.plugin.updateTaskProperty(
						task,
						"recurrence",
						newRecurrence || undefined
					);
					if (anchor !== undefined) {
						await this.plugin.updateTaskProperty(
							task,
							"recurrence_anchor",
							anchor
						);
					}
				} catch (error) {
					console.error("[TaskNotes][TaskListViewCustom] Failed to update recurrence", error);
					new Notice("Failed to update recurrence");
				}
			},
			app: this.plugin.app,
			plugin: this.plugin,
		});
		menu.show(event);
	}

	private showReminderModal(task: TaskInfo): void {
		const modal = new ReminderModal(this.plugin.app, this.plugin, task, async (reminders) => {
			try {
				await this.plugin.updateTaskProperty(
					task,
					"reminders",
					reminders.length > 0 ? reminders : undefined
				);
			} catch (error) {
				console.error("[TaskNotes][TaskListViewCustom] Failed to update reminders", error);
				new Notice("Failed to update reminders");
			}
		});
		modal.open();
	}

	private async openDateContextMenu(
		task: TaskInfo,
		dateType: "due" | "scheduled" | undefined,
		event: MouseEvent
	): Promise<void> {
		if (!dateType) return;
		const currentValue = dateType === "due" ? task.due : task.scheduled;
		const menu = new DateContextMenu({
			currentValue: getDatePart(currentValue || ""),
			currentTime: getTimePart(currentValue || ""),
			onSelect: async (dateValue, timeValue) => {
				try {
					let finalValue: string | undefined;
					if (!dateValue) {
						finalValue = undefined;
					} else if (timeValue) {
						finalValue = `${dateValue}T${timeValue}`;
					} else {
						finalValue = dateValue;
					}
					await this.plugin.updateTaskProperty(task, dateType, finalValue);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.error("[TaskNotes][TaskListViewCustom] Failed to update date", {
						error: message,
						taskPath: task.path,
						dateType,
					});
					new Notice(`Failed to update ${dateType} date: ${message}`);
				}
			},
			plugin: this.plugin,
			app: this.app || this.plugin.app,
		});
		menu.show(event);
	}

	private async handleCardClick(task: TaskInfo, event: MouseEvent): Promise<void> {
		// Check if this is a selection click (shift/ctrl/cmd or in selection mode)
		if (this.handleSelectionClick(event, task.path)) {
			return;
		}

		if (this.plugin.settings.doubleClickAction === "none") {
			await this.executeSingleClickAction(task, event);
			return;
		}

		const existingTimeout = this.clickTimeouts.get(task.path);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
			this.clickTimeouts.delete(task.path);
			await this.executeDoubleClickAction(task, event);
		} else {
			// Use correct window for pop-out window support
			const win = this.containerEl.ownerDocument.defaultView || window;
			const timeout = win.setTimeout(async () => {
				this.clickTimeouts.delete(task.path);
				await this.executeSingleClickAction(task, event);
			}, 250);
			this.clickTimeouts.set(task.path, timeout);
		}
	}

	private async executeSingleClickAction(task: TaskInfo, event: MouseEvent): Promise<void> {
		if (event.ctrlKey || event.metaKey) {
			this.openTaskNote(task, true);
			return;
		}

		switch (this.plugin.settings.singleClickAction) {
			case "edit":
				await this.editTask(task);
				break;
			case "openNote":
				this.openTaskNote(task, false);
				break;
			default:
				break;
		}
	}

	private async executeDoubleClickAction(task: TaskInfo, event: MouseEvent): Promise<void> {
		switch (this.plugin.settings.doubleClickAction) {
			case "edit":
				await this.editTask(task);
				break;
			case "openNote":
				this.openTaskNote(task, false);
				break;
			default:
				break;
		}
	}

	private async editTask(task: TaskInfo): Promise<void> {
		await this.plugin.openTaskEditModal(task);
	}

	private openTaskNote(task: TaskInfo, newTab: boolean): void {
		const app = this.app || this.plugin.app;
		const file = app.vault.getAbstractFileByPath(task.path);
		if (file instanceof TFile) {
			if (newTab) {
				app.workspace.openLinkText(task.path, "", true);
			} else {
				app.workspace.getLeaf(false).openFile(file);
			}
		}
	}

	private async filterProjectSubtasks(task: TaskInfo): Promise<void> {
		try {
			await this.plugin.applyProjectSubtaskFilter(task);
		} catch (error) {
			console.error("[TaskNotes][TaskListViewCustom] Failed to filter project subtasks", error);
			new Notice("Failed to filter project subtasks");
		}
	}

	private async toggleSubtasks(task: TaskInfo, target: HTMLElement): Promise<void> {
		try {
			if (!this.plugin.expandedProjectsService) {
				console.error("[TaskNotes][TaskListViewCustom] ExpandedProjectsService not initialized");
				new Notice("Service not available. Please try reloading the plugin.");
				return;
			}

			const newExpanded = this.plugin.expandedProjectsService.toggle(task.path);
			target.classList.toggle("task-card__chevron--expanded", newExpanded);
			target.setAttribute(
				"aria-label",
				newExpanded ? "Collapse subtasks" : "Expand subtasks"
			);

			// Find the card element and toggle subtasks display
			const card = target.closest<HTMLElement>(".task-card");
			if (card) {
				const { toggleSubtasks } = await import("../ui/TaskCard");
				await toggleSubtasks(card, task, this.plugin, newExpanded);
			}
		} catch (error) {
			console.error("[TaskNotes][TaskListViewCustom] Failed to toggle subtasks", error);
			new Notice("Failed to toggle subtasks");
		}
	}

	private async toggleBlockingTasks(task: TaskInfo, target: HTMLElement): Promise<void> {
		try {
			const expanded = target.classList.toggle("task-card__blocking-toggle--expanded");

			// Find the card element and toggle blocking tasks display
			const card = target.closest<HTMLElement>(".task-card");
			if (card) {
				const { toggleBlockingTasks } = await import("../ui/TaskCard");
				await toggleBlockingTasks(card, task, this.plugin, expanded);
			}
		} catch (error) {
			console.error("[TaskNotes][TaskListViewCustom] Failed to toggle blocking tasks", error);
			new Notice("Failed to toggle blocking tasks");
		}
	}

	private arePathArraysEqual(taskNotes: TaskInfo[], previousPaths: string[]): boolean {
		if (taskNotes.length !== previousPaths.length) return false;
		for (let i = 0; i < taskNotes.length; i++) {
			if (taskNotes[i].path !== previousPaths[i]) return false;
		}
		return true;
	}

	private cleanupNonVirtualRendering(): void {
		this.itemsContainer?.empty();
		this.currentTaskElements.clear();
		this.clearClickTimeouts();
	}

	private destroyVirtualScroller(): void {
		if (this.virtualScroller) {
			this.virtualScroller.destroy();
			this.virtualScroller = null;
		}
	}

	/**
	 * Build a map of task path -> properties for fast lookup during grouping.
	 * Similar to KanbanView's pattern for swimlane grouping.
	 * Includes both regular properties and formula results.
	 */
	private buildPathToPropsMap(): Map<string, Record<string, any>> {
		const map = new Map<string, Record<string, any>>();
		if (!this.data?.data) return map;

		const dataItems = this.dataAdapter.extractDataItems();
		for (const item of dataItems) {
			if (item.path) {
				// Merge regular properties with formula results
				const props = { ...(item.properties || {}) };

				// Add formula results if available
				const formulaOutputs = item.basesData?.formulaResults?.cachedFormulaOutputs;
				if (formulaOutputs && typeof formulaOutputs === 'object') {
					for (const [formulaName, value] of Object.entries(formulaOutputs)) {
						// Store with formula. prefix for easy lookup
						props[`formula.${formulaName}`] = value;
					}
				}

				map.set(item.path, props);
			}
		}
		return map;
	}

	private buildPathToBasesEntryMap(): Map<string, any> {
		const map = new Map<string, any>();
		if (!this.data?.data) return map;

		const dataItems = this.dataAdapter.extractDataItems();
		for (const item of dataItems) {
			if (!item.path) continue;
			map.set(item.path, item.basesData);
		}
		return map;
	}

	/**
	 * Get property value from properties object using property ID.
	 * Handles TaskInfo properties, Bases property IDs (note.*, task.*, file.*), and formulas (formula.*).
	 */
	private getPropertyValue(
		props: Record<string, any>,
		propertyId: string,
		basesEntry?: any
	): any {
		if (!propertyId) return null;

		// Prefer exact match first (e.g., file.path, file.tags, formula.xxx)
		if (Object.prototype.hasOwnProperty.call(props, propertyId)) {
			return props[propertyId];
		}

		// Formula properties are stored with their full prefix (formula.NAME)
		if (propertyId.startsWith('formula.')) {
			return props[propertyId] ?? null;
		}

		if (propertyId === "file.ext") {
			const ext = props["file.extension"];
			if (ext != null) return ext;
		}

		if (propertyId === "file.folder") {
			const filePath =
				(typeof props["file.path"] === "string" && props["file.path"]) ||
				(typeof basesEntry?.file?.path === "string" ? basesEntry.file.path : "");
			if (filePath) {
				const slash = filePath.lastIndexOf("/");
				return slash > 0 ? filePath.slice(0, slash) : "";
			}
		}

		// Strip prefix (note., task., file.) from property ID
		const cleanPropertyId = propertyId.replace(/^(note\.|task\.|file\.)/, '');

		// Fallback to prefix-removed lookup for legacy keys
		if (Object.prototype.hasOwnProperty.call(props, cleanPropertyId)) {
			return props[cleanPropertyId];
		}

		// For file.* computed properties, fetch lazily from Bases entry.
		if (propertyId.startsWith("file.") && basesEntry) {
			const computed = this.dataAdapter.getComputedProperty(basesEntry, propertyId);
			if (computed != null) return computed;
		}

		return null;
	}

	private extractSubGroupKeys(value: unknown): string[] {
		return extractGroupKeys(value, {
			unnest: this.unnestMultiValueGroup,
			noneLabel: "None",
		});
	}

	/**
	 * Group tasks by a sub-property for nested grouping.
	 * Returns a Map of sub-group key -> tasks.
	 */
	private groupTasksBySubProperty(
		tasks: TaskInfo[],
		propertyId: string,
		pathToProps: Map<string, Record<string, any>>,
		pathToBasesEntry: Map<string, any>
	): Map<string, TaskInfo[]> {
		const subGroups = new Map<string, TaskInfo[]>();

		for (const task of tasks) {
			const props = pathToProps.get(task.path) || {};
			const basesEntry = pathToBasesEntry.get(task.path);
			const subValue = this.getPropertyValue(props, propertyId, basesEntry);
			const subKeys = this.extractSubGroupKeys(subValue);
			const uniqueKeys = new Set(subKeys);

			for (const subKey of uniqueKeys) {
				if (!subGroups.has(subKey)) {
					subGroups.set(subKey, []);
				}
				subGroups.get(subKey)!.push(task);
			}
		}

		return subGroups;
	}

	private buildTaskSignature(task: TaskInfo): string {
		// Fast signature using only fields that affect rendering
		return `${task.path}|${task.title}|${task.status}|${task.priority}|${task.due}|${task.scheduled}|${task.recurrence}|${task.archived}|${task.complete_instances?.join(',')}|${task.reminders?.length}|${task.blocking?.length}|${task.blockedBy?.length}`;
	}
}

/**
 * Factory function for Bases registration.
 * Returns an actual TaskListViewCustom instance (extends BasesView).
 */
// Bases登録時にTaskListViewCustomインスタンスを生成するファクトリを返す。
export function buildTaskListViewCustomFactory(plugin: TaskNotesPlugin) {
	return function (controller: any, containerEl: HTMLElement): TaskListViewCustom {
		if (!containerEl) {
			console.error("[TaskNotes][TaskListViewCustom] No containerEl provided");
			throw new Error("TaskListViewCustom requires a containerEl");
		}

		// Create and return the view instance directly
		// TaskListView now properly extends BasesView, so Bases can call its methods directly
		return new TaskListViewCustom(controller, containerEl, plugin);
	};
}
