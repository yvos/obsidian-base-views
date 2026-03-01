import { Component, App, Notice, normalizePath, setIcon } from "obsidian";
import BaseViewsPlugin from "../main";
import { BasesDataAdapter } from "./BasesDataAdapter";
import { PropertyMappingService } from "./PropertyMappingService";
import { TaskInfo, EVENT_TASK_UPDATED } from "../types";
import { convertInternalToUserProperties } from "../utils/propertyMapping";
import { DEFAULT_INTERNAL_VISIBLE_PROPERTIES } from "../settings/defaults";
import { BatchContextMenu } from "../components/BatchContextMenu";

/**
 * Abstract base class for all Base Views Bases views.
 * Properly extends Component to leverage lifecycle, and implements BasesView interface.
 * Note: Bases types (BasesView, BasesViewConfig) are available from obsidian-api declarations.
 */
// 画面描画と操作ハンドリングを統括するビュー実装。
export abstract class BasesViewBase extends Component {
	// BasesView properties (provided by Bases when factory returns this instance)
	// These match the BasesView interface from Obsidian's internal Bases API
	app!: App;
	config!: any; // BasesViewConfig - using any since not exported from public API
	data!: any; // BasesQueryResult - using any since not exported from public API
	protected plugin: BaseViewsPlugin;
	protected dataAdapter: BasesDataAdapter;
	protected propertyMapper: PropertyMappingService;
	protected containerEl: HTMLElement;
	protected rootElement: HTMLElement | null = null;
	protected taskUpdateListener: any = null;
	protected updateDebounceTimer: number | null = null;
	protected dataUpdateDebounceTimer: number | null = null;
	protected relevantPathsCache: Set<string> = new Set();

	// Selection mode state
	protected selectionModeCleanup: (() => void) | null = null;
	protected selectionIndicatorEl: HTMLElement | null = null;

	constructor(controller: any, containerEl: HTMLElement, plugin: BaseViewsPlugin) {
		// Call Component constructor
		super();
		this.plugin = plugin;
		this.containerEl = containerEl;

		// Note: app, config, and data will be set by Bases when it creates the view
		// We just need to ensure our types match the BasesView interface

		this.dataAdapter = new BasesDataAdapter(this);
		this.propertyMapper = new PropertyMappingService(plugin, plugin.fieldMapper);

		// Bind createFileForView to ensure Bases can find it
		// Some versions of Bases may check hasOwnProperty rather than prototype chain
		this.createFileForView = this.createFileForView.bind(this);
	}

	/**
	 * Component lifecycle: Called when view is first loaded.
	 * Override from Component base class.
	 */
	onload(): void {
		this.setupContainer();
		this.setupTaskUpdateListener();
		this.setupSelectionHandling();
		this.updateRelevantPathsCache();
		this.render();
	}

	/**
	 * BasesView lifecycle: Called when Bases data changes.
	 * Required abstract method implementation.
	 * Debounced to prevent excessive re-renders during rapid file saves.
	 */
	onDataUpdated(): void {
		// Skip if view is not visible
		// イベント種別ごとの分岐処理を集約し、状態遷移を一箇所で制御する。
		if (!this.rootElement?.isConnected) {
			return;
		}

		// Debounce data updates to avoid freezing during typing
		if (this.dataUpdateDebounceTimer) {
			clearTimeout(this.dataUpdateDebounceTimer);
		}

		// Use correct window for pop-out window support
		const win = this.containerEl.ownerDocument.defaultView || window;
		this.dataUpdateDebounceTimer = win.setTimeout(() => {
			this.dataUpdateDebounceTimer = null;
			try {
				this.render();
			} catch (error) {
				console.error(`[BaseViews][${this.type}] Render error:`, error);
				this.renderError(error as Error);
			}
		}, 500);  // 500ms debounce for data updates
	}

	/**
	 * Update the cache of relevant paths for efficient update checking.
	 * Called when data changes to avoid expensive lookups on every task update.
	 */
	protected updateRelevantPathsCache(): void {
		this.relevantPathsCache.clear();

		try {
			const dataItems = this.dataAdapter.extractDataItems();
			for (const item of dataItems) {
				if (item.path) {
					this.relevantPathsCache.add(item.path);
				}
			}
		} catch {
			// Ignore errors - cache will be empty and all updates will be processed
		}
	}

	/**
	 * Lifecycle: Save ephemeral state (scroll position, etc).
	 */
	getEphemeralState(): any {
		return {
			scrollTop: this.rootElement?.scrollTop || 0,
		};
	}

	/**
	 * Lifecycle: Restore ephemeral state.
	 */
	setEphemeralState(state: any): void {
		if (!state || !this.rootElement || !this.rootElement.isConnected) return;

		try {
			if (state.scrollTop !== undefined) {
				this.rootElement.scrollTop = state.scrollTop;
			}
		} catch (e) {
			console.debug("[BaseViews][Bases] Failed to restore ephemeral state:", e);
		}
	}

	/**
	 * Lifecycle: Focus this view.
	 */
	focus(): void {
		try {
			if (this.rootElement?.isConnected && typeof this.rootElement.focus === "function") {
				this.rootElement.focus();
			}
		} catch (e) {
			console.debug("[BaseViews][Bases] Failed to focus view:", e);
		}
	}

	/**
	 * Lifecycle: Refresh/re-render the view.
	 */
	refresh(): void {
		this.render();
	}

	/**
	 * Lifecycle: Handle view resize.
	 * Called by Bases when the view container is resized.
	 * Subclasses can override to handle resize events.
	 */
	onResize(): void {
		// Default implementation does nothing
		// Subclasses can override if they need resize handling
	}

	/**
	 * Setup container element for this view.
	 */
	protected setupContainer(): void {
		this.containerEl.empty();

		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;
		const root = doc.createElement("div");
		const isTaskListCustom = this.type === "tasknotesTaskListCustom";
		const typeClass = isTaskListCustom ? `tn-${this.type}` : `bv-${this.type}`;
		const scopeClasses = isTaskListCustom ? " tasknotes-plugin tasknotes-container" : "";
		root.className = `bv-bases-integration${scopeClasses} ${typeClass}`;
		root.tabIndex = -1; // Make focusable without adding to tab order
		this.containerEl.appendChild(root);
		this.rootElement = root;

		// Add custom "New Task" button and hide the default Bases "New" button
		this.setupNewTaskButton();
	}

	/**
	 * Setup custom "New Task" button that opens the external task runtime creation modal.
	 * Injects the button into the Bases toolbar and hides the default "New" button.
	 */
	protected setupNewTaskButton(): void {
		// Defer to allow Bases to render its toolbar first
		setTimeout(() => this.injectNewTaskButton(), 100);

		// Register cleanup to toggle off the active class when view is unloaded
		this.register(() => this.cleanupNewTaskButton());
	}

	/**
	 * Clean up: just remove the "active" class, keep the button for reuse.
	 */
	private cleanupNewTaskButton(): void {
		const basesViewEl = this.containerEl.closest(".bases-view");
		const parentEl = basesViewEl?.parentElement;

		// Only remove the "active" class - button stays for potential reuse
		parentEl?.classList.remove("baseviews-view-active");
	}

	/**
	 * Inject the custom "New Task" button into the Bases toolbar.
	 */
	private injectNewTaskButton(): void {
		// Find the Bases view container
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const basesViewEl = this.containerEl.closest(".bases-view");
		if (!basesViewEl) {
			console.debug("[BaseViews][Bases] No .bases-view found");
			return;
		}

		// The toolbar is a sibling of .bases-view, not a child
		// Look in the parent container for the toolbar
		const parentEl = basesViewEl.parentElement;
		if (!parentEl) {
			console.debug("[BaseViews][Bases] No parent element found");
			return;
		}

		// Mark parent as having an active Base Views custom view (controls visibility via CSS)
		parentEl.classList.add("baseviews-view-active");

		const toolbarEl = parentEl.querySelector(".bases-toolbar");
		if (!toolbarEl) {
			console.debug("[BaseViews][Bases] No .bases-toolbar found in parent");
			return;
		}

		// Check if we already added the button (reuse existing)
		if (toolbarEl.querySelector(".bv-bases-new-task-btn")) return;

		// Use correct document for pop-out window support
		const doc = this.containerEl.ownerDocument;

		// Create "New Task" button matching Bases' text-icon-button style
		const newTaskBtn = doc.createElement("div");
		newTaskBtn.className = "bases-toolbar-item bv-bases-new-task-btn";

		const innerBtn = doc.createElement("div");
		innerBtn.className = "text-icon-button";
		innerBtn.tabIndex = 0;

		// Add icon
		const iconSpan = doc.createElement("span");
		iconSpan.className = "text-button-icon";
		setIcon(iconSpan, "plus");
		innerBtn.appendChild(iconSpan);

		// Add label
		const labelSpan = doc.createElement("span");
		labelSpan.className = "text-button-label";
		labelSpan.textContent = this.plugin.i18n.translate("common.new");
		innerBtn.appendChild(labelSpan);

		newTaskBtn.appendChild(innerBtn);

		newTaskBtn.addEventListener("click", () => {
			this.createFileForView("New Task");
		});

		// Find the original "New" button position and insert our button there
		const originalNewBtn = toolbarEl.querySelector(".bases-toolbar-new-item-menu");
		if (originalNewBtn) {
			// Insert before the original (which will be hidden by CSS)
			originalNewBtn.before(newTaskBtn);
		} else {
			// Fallback: append to end of toolbar
			toolbarEl.appendChild(newTaskBtn);
		}

		console.debug("[BaseViews][Bases] Injected New Task button into toolbar");
	}

	/**
	 * Setup listener for real-time task updates.
	 * Uses Component.register() for automatic cleanup on unload.
	 */
	protected setupTaskUpdateListener(): void {
		// 必要なイベントやコマンドを一括登録し、初期化の前提を整える。
		if (this.taskUpdateListener) return;

		this.taskUpdateListener = this.plugin.emitter.on(EVENT_TASK_UPDATED, async (eventData: any) => {
			try {
				const updatedTask = eventData?.task || eventData?.taskInfo;
				if (!updatedTask?.path) return;

				// Skip if view is not visible (no point updating hidden views)
				if (!this.rootElement?.isConnected) return;

				// Use cached Set for O(1) lookup instead of O(n) iteration
				const isRelevant = this.relevantPathsCache.has(updatedTask.path);

				if (isRelevant) {
					await this.handleTaskUpdate(updatedTask);
				}
			} catch (error) {
				console.error("[BaseViews][Bases] Error in task update handler:", error);
				this.debouncedRefresh();
			}
		});

		// Register cleanup using Component lifecycle
		this.register(() => {
			if (this.taskUpdateListener) {
				this.plugin.emitter.offref(this.taskUpdateListener);
				this.taskUpdateListener = null;
			}
		});
	}

	/**
	 * Debounced refresh to prevent multiple rapid re-renders.
	 * Timer is automatically cleaned up on component unload.
	 */
	protected debouncedRefresh(): void {
		if (this.updateDebounceTimer) {
			clearTimeout(this.updateDebounceTimer);
		}

		// Use correct window for pop-out window support
		const win = this.containerEl.ownerDocument.defaultView || window;
		this.updateDebounceTimer = win.setTimeout(() => {
			this.render();
			this.updateDebounceTimer = null;
		}, 300);  // Increased from 150ms for better typing performance

		// Note: We don't need to explicitly register cleanup for this timer
		// because it's short-lived (300ms) and clears itself. If the component
		// unloads before the timer fires, the worst case is a no-op render call.
	}

	/**
	 * Override Bases "New" button to open external runtime task creation instead of default file creation.
	 * Called when user clicks the "New" button in the Bases toolbar.
	 *
	 * NOTE: This requires Obsidian API 1.10.2+ and Bases support for createFileForView.
	 * As of the current implementation, Bases (still in beta) may not yet call this method.
	 * When Obsidian 1.10.2 is released and Bases supports it, this will work automatically.
	 *
	 * @param baseFileName - Suggested filename from Bases (typically unused in this integration)
	 * @param frontmatterProcessor - Optional callback that Bases uses to set default frontmatter values
	 */
	async createFileForView(
		baseFileName: string,
		frontmatterProcessor?: (frontmatter: any) => void
	): Promise<void> {
		const app = this.app || this.plugin.app;

		const runtimeResolver = (
			this.plugin as unknown as {
				getTaskRuntime?: () => unknown;
			}
		).getTaskRuntime;
		if (typeof runtimeResolver === "function") {
			const runtime = runtimeResolver.call(this.plugin) as
				| { openTaskCreationModal?: () => unknown }
				| null;
			if (runtime && typeof runtime.openTaskCreationModal === "function") {
				runtime.openTaskCreationModal();
				return;
			}
		}

		const folder = this.plugin.settings.tasksFolder || "Tasks";
		const safeName = (baseFileName || "New Task")
			.replace(/[\\\\/:*?\"<>|]/g, " ")
			.trim()
			.replace(/\\s+/g, " ");
		const filename = `${safeName || "New Task"}-${Date.now()}.md`;
		const filePath = normalizePath(`${folder}/${filename}`);

		try {
			await app.vault.createFolder(folder).catch(() => undefined);
			const file = await app.vault.create(filePath, "");
			await app.workspace.getLeaf(false).openFile(file);
		} catch (error) {
			console.error("[BaseViews][Bases] Failed to create file from Bases new action:", error);
			const noticeKey = "notices.basesCreateFileFailed";
			const translated = this.plugin.i18n?.translate(noticeKey);
			new Notice(
				translated && translated !== noticeKey
					? translated
					: "Failed to create a new note from Bases view."
			);
		}
	}

	/**
	 * Get visible properties for rendering task cards.
	 * Uses BasesView's config API directly.
	 */
	protected getVisibleProperties(): string[] {
		// Get ordered properties from Bases config (configured by user in Bases UI)
		const basesPropertyIds = this.config.getOrder();
		let visibleProperties = this.propertyMapper.mapVisibleProperties(basesPropertyIds);

		// Fallback to plugin defaults if no properties configured
		if (!visibleProperties || visibleProperties.length === 0) {
			const internalDefaults = this.plugin.settings.defaultVisibleProperties || [
				...DEFAULT_INTERNAL_VISIBLE_PROPERTIES,
				"tags",
			];
			// Convert internal field names to user-configured property names
			visibleProperties = convertInternalToUserProperties(internalDefaults, this.plugin);
		}

		return visibleProperties;
	}

	// =====================
	// Selection Mode Methods
	// =====================

	/**
	 * Setup selection mode handling (keyboard shortcuts and listeners).
	 */
	protected setupSelectionHandling(): void {
		if (!this.rootElement) return;

		const selectionService = this.plugin.taskSelectionService;
		if (!selectionService) return;

		// Keyboard event handler for selection mode
		const handleKeyDown = (e: KeyboardEvent) => {
			// Escape exits selection mode and clears selection
			if (e.key === "Escape" && selectionService.isSelectionModeActive()) {
				selectionService.exitSelectionMode(true);
				this.updateSelectionModeUI(false);
			}

			// Ctrl/Cmd + A to select all visible tasks (only when in selection mode)
			if ((e.ctrlKey || e.metaKey) && e.key === "a" && selectionService.isSelectionModeActive()) {
				e.preventDefault();
				const visiblePaths = this.getVisibleTaskPaths();
				selectionService.selectAll(visiblePaths);
				this.updateSelectionVisuals();
			}
		};

		// Add listener to the root element
		this.rootElement.addEventListener("keydown", handleKeyDown);

		// Listen for selection changes to update UI
		const unsubscribeSelection = selectionService.onSelectionChange((paths: string[]) => {
			this.updateSelectionVisuals();
			this.updateSelectionIndicator(paths.length);
		});

		const unsubscribeMode = selectionService.onSelectionModeChange((active: boolean) => {
			this.updateSelectionModeUI(active);
		});

		// Register cleanup
		this.register(() => {
			this.rootElement?.removeEventListener("keydown", handleKeyDown);
			unsubscribeSelection();
			unsubscribeMode();
		});
	}

	/**
	 * Update UI to reflect selection mode state.
	 */
	protected updateSelectionModeUI(active: boolean): void {
		if (!this.rootElement) return;

		if (active) {
			this.rootElement.classList.add("tn-selection-mode");
			this.rootElement.setAttribute("data-selection-mode", "true");
		} else {
			this.rootElement.classList.remove("tn-selection-mode");
			this.rootElement.removeAttribute("data-selection-mode");
			// Also clear visual selection indicators
			this.clearSelectionVisuals();
		}
	}

	/**
	 * Update visual selection state on task cards.
	 */
	protected updateSelectionVisuals(): void {
		if (!this.rootElement) return;

		const selectionService = this.plugin.taskSelectionService;
		if (!selectionService) return;

		// Find all task cards and update their selection state
		const primaryPath = selectionService.getPrimarySelectedPath();

		const cards = this.rootElement.querySelectorAll<HTMLElement>(".task-card");
		for (const card of cards) {
			const path = card.dataset.taskPath;
			if (path) {
				if (selectionService.isSelected(path)) {
					card.classList.add("task-card--selected");
					if (path === primaryPath) {
						card.classList.add("task-card--selected-primary");
					} else {
						card.classList.remove("task-card--selected-primary");
					}
				} else {
					card.classList.remove("task-card--selected");
					card.classList.remove("task-card--selected-primary");
				}
			}
		}

		// Also update kanban card wrappers (for visual consistency)
		const cardWrappers = this.rootElement.querySelectorAll<HTMLElement>(".kanban-view__card-wrapper");
		for (const wrapper of cardWrappers) {
			const path = wrapper.dataset.taskPath;
			if (path) {
				if (selectionService.isSelected(path)) {
					wrapper.classList.add("kanban-view__card-wrapper--selected");
					if (path === primaryPath) {
						wrapper.classList.add("kanban-view__card-wrapper--selected-primary");
					} else {
						wrapper.classList.remove("kanban-view__card-wrapper--selected-primary");
					}
				} else {
					wrapper.classList.remove("kanban-view__card-wrapper--selected");
					wrapper.classList.remove("kanban-view__card-wrapper--selected-primary");
				}
			}
		}
	}

	/**
	 * Clear all visual selection indicators.
	 */
	protected clearSelectionVisuals(): void {
		if (!this.rootElement) return;

		const cards = this.rootElement.querySelectorAll<HTMLElement>(".task-card--selected");
		for (const card of cards) {
			card.classList.remove("task-card--selected");
			card.classList.remove("task-card--selected-primary");
		}

		const cardWrappers = this.rootElement.querySelectorAll<HTMLElement>(".kanban-view__card-wrapper--selected");
		for (const wrapper of cardWrappers) {
			wrapper.classList.remove("kanban-view__card-wrapper--selected");
			wrapper.classList.remove("kanban-view__card-wrapper--selected-primary");
		}
	}

	/**
	 * Update selection count indicator.
	 */
	protected updateSelectionIndicator(count: number): void {
		if (!this.rootElement) return;

		if (count > 0) {
			// Create or update indicator
			if (!this.selectionIndicatorEl) {
				// Use correct document for pop-out window support
				const doc = this.rootElement.ownerDocument;
				this.selectionIndicatorEl = doc.createElement("div");
				this.selectionIndicatorEl.className = "tn-selection-indicator";
				this.selectionIndicatorEl.addEventListener("click", () => {
					this.plugin.taskSelectionService?.clearSelection();
					this.plugin.taskSelectionService?.exitSelectionMode();
				});
				this.rootElement.appendChild(this.selectionIndicatorEl);
			}
			this.selectionIndicatorEl.textContent = `${count} selected`;
			this.selectionIndicatorEl.style.display = "block";
		} else if (this.selectionIndicatorEl) {
			this.selectionIndicatorEl.style.display = "none";
		}
	}

	/**
	 * Handle task card click in selection mode.
	 * Returns true if the click was handled as a selection action.
	 */
	protected handleSelectionClick(event: MouseEvent, taskPath: string): boolean {
		const selectionService = this.plugin.taskSelectionService;
		if (!selectionService) return false;

		// If not in selection mode and no modifier keys, don't handle
		if (!selectionService.isSelectionModeActive() && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
			return false;
		}

		// Enter selection mode if shift is pressed
		if (event.shiftKey && !selectionService.isSelectionModeActive()) {
			selectionService.enterSelectionMode();
		}

		// Handle different click modes
		if (event.shiftKey) {
			// Range selection
			const visiblePaths = this.getVisibleTaskPaths();
			selectionService.selectRange(taskPath, visiblePaths);
		} else if (event.ctrlKey || event.metaKey) {
			// Toggle individual selection
			selectionService.toggleSelection(taskPath);
		} else if (selectionService.isSelectionModeActive()) {
			// In selection mode, regular click toggles selection
			selectionService.toggleSelection(taskPath);
		}

		this.updateSelectionVisuals();
		return true;
	}

	/**
	 * Show batch context menu for selected tasks.
	 */
	protected showBatchContextMenu(event: MouseEvent): void {
		const selectionService = this.plugin.taskSelectionService;
		if (!selectionService) return;

		const selectedPaths = selectionService.getSelectedPaths();
		if (selectedPaths.length === 0) return;

		const menu = new BatchContextMenu({
			plugin: this.plugin,
			selectedPaths,
			onUpdate: () => {
				this.render();
			},
		});

		menu.show(event);
	}

	/**
	 * Get paths of all currently visible tasks.
	 * Subclasses should override this to return the correct paths based on their rendering.
	 */
	protected getVisibleTaskPaths(): string[] {
		// Default implementation: extract from DOM
		if (!this.rootElement) return [];

		const cards = this.rootElement.querySelectorAll<HTMLElement>(".task-card[data-task-path]");
		const paths: string[] = [];
		for (const card of cards) {
			const path = card.dataset.taskPath;
			if (path) {
				paths.push(path);
			}
		}
		return paths;
	}

	// Abstract methods that subclasses must implement

	/**
	 * Render the view with current data.
	 * Subclasses implement view-specific rendering (list, kanban, calendar).
	 */
	abstract render(): void;

	/**
	 * Render an error state when rendering fails.
	 * Subclasses should display user-friendly error messages.
	 * Made public to match abstract method visibility requirements.
	 */
	abstract renderError(error: Error): void;

	/**
	 * Handle a single task update for selective rendering.
	 * Subclasses can implement efficient updates or fall back to full refresh.
	 */
	protected abstract handleTaskUpdate(task: TaskInfo): Promise<void>;

	/**
	 * The view type identifier (required by BasesView).
	 * Must be unique across all registered Bases views.
	 */
	abstract type: string;
}



