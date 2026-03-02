import { Command, Events, Notice, Plugin } from "obsidian";
import { BaseViewsSettings } from "./types/settings";
import { createI18nService, I18nService } from "./i18n";
import { FieldMapper } from "./services/FieldMapper";
import {
	hasAnyBaseViewsFeatureEnabled,
	migrateBaseViewsSettings,
	normalizeBaseViewsUILanguage,
} from "./settings/migrations";
import {
	getTaskNotesRuntime,
	hasTaskNotesRuntime,
	TaskCalendarSyncServiceLike,
	TaskNotesRuntimeLike,
} from "./integrations/tasknotes/TaskNotesRuntimeBridge";
import { registerBasesTaskList, unregisterBasesViews } from "./bases/registration";
import { BasesViewListSidebarService } from "./bases/BasesViewListSidebarService";
import { BaseViewsSettingTab } from "./settings/BaseViewsSettingTab";

const COMMAND_ID_TOGGLE_ACTIVE_BASE_VIEW_LIST = "toggle-active-base-view-list";
const COMMAND_ID_OPEN_NEXT_BASE_VIEW = "open-next-base-view";
const COMMAND_ID_OPEN_PREVIOUS_BASE_VIEW = "open-previous-base-view";

// BaseViewsPluginの中核ロジックをまとめるクラス。
export default class BaseViewsPlugin extends Plugin {
	// Allow legacy modules (TaskCard, Base views) to access runtime-delegated members.
	[key: string]: any;

	settings: BaseViewsSettings;
	i18n: I18nService;
	fieldMapper: FieldMapper;
	emitter: Events | any;
	taskCalendarSyncService: TaskCalendarSyncServiceLike | null = null;

	private localEmitter = new Events();
	private taskRuntime: TaskNotesRuntimeLike | null = null;
	private basesRegistered = false;
	private registeredCustomViewConfig: string | null = null;
	private basesViewListSidebarService: BasesViewListSidebarService | null = null;
	private toggleActiveBaseViewListCommand: Command | null = null;
	private openNextBaseViewCommand: Command | null = null;
	private openPreviousBaseViewCommand: Command | null = null;
	async onload() {
		await this.loadSettings();

		this.i18n = createI18nService({
			initialLocale: this.settings.uiLanguage ?? "en",
		});

		this.fieldMapper = new FieldMapper(this.settings.fieldMapping);
		this.emitter = this.localEmitter;
		this.syncTaskRuntimeBindings();
		this.registerBaseViewCommands();

		this.addSettingTab(new BaseViewsSettingTab(this.app, this));

		await this.syncBasesFeatureBindings();

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.syncTaskRuntimeBindings();
			})
		);
	}

	onunload() {
		if (this.basesViewListSidebarService) {
			this.basesViewListSidebarService.stop();
			this.basesViewListSidebarService = null;
		}

		if (this.basesRegistered) {
			unregisterBasesViews(this);
			this.basesRegistered = false;
			this.registeredCustomViewConfig = null;
		}

		this.toggleActiveBaseViewListCommand = null;
		this.openNextBaseViewCommand = null;
		this.openPreviousBaseViewCommand = null;
	}

	async loadSettings() {
		// 保存データを読み込み、既定値補完を含めて利用可能な状態へ整える。
		const loadedData = (await this.loadData()) as Partial<BaseViewsSettings> | null;
		this.settings = migrateBaseViewsSettings(loadedData);
	}

	async saveSettings() {
		this.settings.enableBases = hasAnyBaseViewsFeatureEnabled(this.settings);
		this.settings.uiLanguage = normalizeBaseViewsUILanguage(this.settings.uiLanguage);
		await this.saveData(this.settings);
		this.i18n?.setLocale(this.settings.uiLanguage ?? "en");
		this.updateBaseViewCommandLabels();
		await this.syncBasesFeatureBindings();
		this.emitSettingsChanged();
		this.syncTaskRuntimeBindings();
	}

	private registerBaseViewCommands(): void {
		this.toggleActiveBaseViewListCommand = this.addCommand({
			id: COMMAND_ID_TOGGLE_ACTIVE_BASE_VIEW_LIST,
			name: this.getToggleActiveBaseViewListCommandName(),
			callback: () => {
				void this.toggleActiveBaseViewListFromCommand();
			},
		});

		this.openNextBaseViewCommand = this.addCommand({
			id: COMMAND_ID_OPEN_NEXT_BASE_VIEW,
			name: this.getOpenNextBaseViewCommandName(),
			callback: () => {
				void this.openAdjacentBaseViewFromCommand("next");
			},
		});

		this.openPreviousBaseViewCommand = this.addCommand({
			id: COMMAND_ID_OPEN_PREVIOUS_BASE_VIEW,
			name: this.getOpenPreviousBaseViewCommandName(),
			callback: () => {
				void this.openAdjacentBaseViewFromCommand("previous");
			},
		});
	}

	private updateBaseViewCommandLabels(): void {
		if (this.toggleActiveBaseViewListCommand) {
			this.toggleActiveBaseViewListCommand.name = this.getToggleActiveBaseViewListCommandName();
		}
		if (this.openNextBaseViewCommand) {
			this.openNextBaseViewCommand.name = this.getOpenNextBaseViewCommandName();
		}
		if (this.openPreviousBaseViewCommand) {
			this.openPreviousBaseViewCommand.name = this.getOpenPreviousBaseViewCommandName();
		}
	}

	private getToggleActiveBaseViewListCommandName(): string {
		return this.translateWithFallback("commands.toggleBaseViewList", "Toggle view list");
	}

	private getOpenNextBaseViewCommandName(): string {
		return this.translateWithFallback("commands.openNextBaseView", "Open next view");
	}

	private getOpenPreviousBaseViewCommandName(): string {
		return this.translateWithFallback("commands.openPreviousBaseView", "Open previous view");
	}

	private getViewListServiceForCommands(): BasesViewListSidebarService {
		if (!this.basesViewListSidebarService) {
			this.basesViewListSidebarService = new BasesViewListSidebarService(this);
		}
		return this.basesViewListSidebarService;
	}

	private async toggleActiveBaseViewListFromCommand(): Promise<void> {
		if (!this.settings.enableBasesViewListSidebar) return;
		if (!this.basesViewListSidebarService) return;
		await this.basesViewListSidebarService.toggleViewListForActiveBaseLeaf();
	}

	private async openAdjacentBaseViewFromCommand(direction: "next" | "previous"): Promise<void> {
		const service = this.getViewListServiceForCommands();
		if (direction === "next") {
			await service.openNextViewForActiveBaseLeaf();
			return;
		}
		await service.openPreviousViewForActiveBaseLeaf();
	}

	private getCustomViewFeatureConfigKey(): string {
		const customTable = this.settings.enableBasesCustomTableView ? "1" : "0";
		const taskListCustom = this.settings.enableBasesTaskListCustomView ? "1" : "0";
		return `${customTable}:${taskListCustom}`;
	}

	private async syncBasesFeatureBindings(): Promise<void> {
		// 関連状態の差分を吸収し、整合性を保った状態へ同期する。
		const customViewConfigKey = this.getCustomViewFeatureConfigKey();
		const shouldRegisterCustomViews =
			this.settings.enableBasesCustomTableView || this.settings.enableBasesTaskListCustomView;
		const shouldReRegisterCustomViews =
			shouldRegisterCustomViews &&
			(!this.basesRegistered || this.registeredCustomViewConfig !== customViewConfigKey);

		if (shouldReRegisterCustomViews) {
			if (this.basesRegistered) {
				unregisterBasesViews(this);
			}
			await registerBasesTaskList(this);
			this.basesRegistered = true;
			this.registeredCustomViewConfig = customViewConfigKey;
		} else if (!shouldRegisterCustomViews && this.basesRegistered) {
			unregisterBasesViews(this);
			this.basesRegistered = false;
			this.registeredCustomViewConfig = null;
		}

		const shouldRunViewListService = this.settings.enableBasesViewListSidebar;
		if (shouldRunViewListService) {
			if (!this.basesViewListSidebarService) {
				this.basesViewListSidebarService = new BasesViewListSidebarService(this);
			}
			this.basesViewListSidebarService.start();
			return;
		}

		if (this.basesViewListSidebarService) {
			this.basesViewListSidebarService.stop();
			this.basesViewListSidebarService = null;
		}
	}

	hasTaskRuntime(): boolean {
		return hasTaskNotesRuntime(this.app);
	}

	getTaskRuntime(): TaskNotesRuntimeLike | null {
		return getTaskNotesRuntime(this.app);
	}

	// Backward-compatible wrappers for legacy call sites.
	hasTaskNotesRuntime(): boolean {
		return this.hasTaskRuntime();
	}

	getTaskNotesRuntime(): TaskNotesRuntimeLike | null {
		return this.getTaskRuntime();
	}

	private syncTaskRuntimeBindings(): void {
		const runtime = this.getTaskRuntime();
		this.taskRuntime = runtime;

		this.emitter = runtime?.emitter && typeof runtime.emitter.on === "function"
			? runtime.emitter
			: this.localEmitter;

		if (runtime?.fieldMapper) {
			this.fieldMapper = runtime.fieldMapper as FieldMapper;
		}

		this.cacheManager = runtime?.cacheManager ?? null;
		this.dependencyCache = runtime?.dependencyCache ?? null;
		this.statusManager = runtime?.statusManager ?? null;
		this.priorityManager = runtime?.priorityManager ?? null;
		this.taskService = runtime?.taskService ?? null;
		this.taskCalendarSyncService = runtime?.taskCalendarSyncService ?? null;
		this.projectSubtasksService = runtime?.projectSubtasksService ?? null;
		this.expandedProjectsService = runtime?.expandedProjectsService ?? null;
		this.taskSelectionService = runtime?.taskSelectionService ?? null;
	}

	private emitSettingsChanged(): void {
		if (typeof this.localEmitter.trigger === "function") {
			this.localEmitter.trigger("settings-changed");
		}
		if (this.emitter && this.emitter !== this.localEmitter && typeof this.emitter.trigger === "function") {
			this.emitter.trigger("settings-changed");
		}
	}

	private runtimeOrError(methodName: string): TaskNotesRuntimeLike {
		const runtime = this.taskRuntime ?? this.getTaskRuntime();
		if (runtime) {
			return runtime;
		}
		throw new Error(`Task runtime is required for ${methodName}`);
	}

	async toggleRecurringTaskComplete(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("toggleRecurringTaskComplete");
		if (typeof runtime.toggleRecurringTaskComplete !== "function") {
			throw new Error("Task runtime does not provide toggleRecurringTaskComplete");
		}
		return runtime.toggleRecurringTaskComplete(...args);
	}

	async toggleTaskStatus(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("toggleTaskStatus");
		if (typeof runtime.toggleTaskStatus !== "function") {
			throw new Error("Task runtime does not provide toggleTaskStatus");
		}
		return runtime.toggleTaskStatus(...args);
	}

	async updateTaskProperty(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("updateTaskProperty");
		if (typeof runtime.updateTaskProperty !== "function") {
			throw new Error("Task runtime does not provide updateTaskProperty");
		}
		return runtime.updateTaskProperty(...args);
	}

	async openTaskEditModal(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("openTaskEditModal");
		if (typeof runtime.openTaskEditModal !== "function") {
			throw new Error("Task runtime does not provide openTaskEditModal");
		}
		return runtime.openTaskEditModal(...args);
	}

	openTaskCreationModal(...args: unknown[]): unknown {
		const runtime = this.runtimeOrError("openTaskCreationModal");
		if (typeof runtime.openTaskCreationModal !== "function") {
			throw new Error("Task runtime does not provide openTaskCreationModal");
		}
		return runtime.openTaskCreationModal(...args);
	}

	async applyProjectSubtaskFilter(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("applyProjectSubtaskFilter");
		if (typeof runtime.applyProjectSubtaskFilter !== "function") {
			throw new Error("Task runtime does not provide applyProjectSubtaskFilter");
		}
		return runtime.applyProjectSubtaskFilter(...args);
	}

	getActiveTimeSession(...args: unknown[]): unknown {
		const runtime = this.taskRuntime ?? this.getTaskRuntime();
		if (runtime && typeof runtime.getActiveTimeSession === "function") {
			return runtime.getActiveTimeSession(...args);
		}
		return null;
	}

	async openTagsPane(...args: unknown[]): Promise<boolean> {
		const runtime = this.taskRuntime ?? this.getTaskRuntime();
		if (runtime && typeof runtime.openTagsPane === "function") {
			return Boolean(await runtime.openTagsPane(...args));
		}
		new Notice(
			this.translateWithFallback(
				"notices.taskNotesRuntimeRequiredForTagSearch",
				"TaskNotes runtime is required for tag search actions."
			)
		);
		return false;
	}

	private translateWithFallback(
		key: string,
		fallback: string,
		params?: Record<string, string | number>
	): string {
		const translated = this.i18n?.translate(key, params);
		if (translated && translated !== key) {
			return translated;
		}
		return fallback;
	}

	formatTime(...args: unknown[]): string {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const runtime = this.taskRuntime ?? this.getTaskRuntime();
		if (runtime && typeof runtime.formatTime === "function") {
			return runtime.formatTime(...args);
		}
		const value = Number(args[0] ?? 0);
		if (!Number.isFinite(value)) return "0m";
		if (value >= 60) {
			const hours = Math.floor(value / 60);
			const minutes = Math.round(value % 60);
			return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
		}
		return `${Math.round(value)}m`;
	}
}
