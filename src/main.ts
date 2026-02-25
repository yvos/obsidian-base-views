import { Events, Notice, Plugin } from "obsidian";
import { TaskNotesSettings } from "./types/settings";
import { DEFAULT_SETTINGS } from "./settings/defaults";
import { createI18nService, I18nService } from "./i18n";
import { FieldMapper } from "./services/FieldMapper";
import {
	getTaskNotesRuntime,
	hasTaskNotesRuntime,
	TaskNotesRuntimeLike,
} from "./integrations/tasknotes/TaskNotesRuntimeBridge";
import { registerBasesTaskList, unregisterBasesViews } from "./bases/registration";
import { BasesViewListSidebarService } from "./bases/BasesViewListSidebarService";
import { BaseViewsSettingTab } from "./settings/BaseViewsSettingTab";

// NOTE:
// Keep the historical class name for compatibility with existing imports.
// TaskNotesPluginの中核ロジックをまとめるクラス。
export default class TaskNotesPlugin extends Plugin {
	// Allow legacy modules (TaskCard, Base views) to access runtime-delegated members.
	[key: string]: any;

	settings: TaskNotesSettings;
	i18n: I18nService;
	fieldMapper: FieldMapper;
	emitter: Events | any;

	private localEmitter = new Events();
	private taskNotesRuntime: TaskNotesRuntimeLike | null = null;
	private basesRegistered = false;
	private registeredCustomViewConfig: string | null = null;
	private basesViewListSidebarService: BasesViewListSidebarService | null = null;
	private static readonly SUPPORTED_UI_LANGUAGES = new Set(["en", "ja"]);

	async onload() {
		await this.loadSettings();

		this.i18n = createI18nService({
			initialLocale: this.settings.uiLanguage ?? "en",
		});

		this.fieldMapper = new FieldMapper(this.settings.fieldMapping);
		this.emitter = this.localEmitter;
		this.syncTaskNotesRuntimeBindings();

		this.addSettingTab(new BaseViewsSettingTab(this.app, this));

		await this.syncBasesFeatureBindings();

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.syncTaskNotesRuntimeBindings();
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
	}

	async loadSettings() {
		// 保存データを読み込み、既定値補完を含めて利用可能な状態へ整える。
		const loadedData = (await this.loadData()) as Partial<TaskNotesSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});

		// Legacy migration: when only the old global switch exists, fan out to the 3 feature toggles.
		const legacyEnableBases =
			loadedData && typeof loadedData.enableBases === "boolean"
				? loadedData.enableBases
				: null;
		if (legacyEnableBases !== null) {
			if (typeof loadedData?.enableBasesViewListSidebar !== "boolean") {
				this.settings.enableBasesViewListSidebar = legacyEnableBases;
			}
			if (typeof loadedData?.enableBasesCustomTableView !== "boolean") {
				this.settings.enableBasesCustomTableView = legacyEnableBases;
			}
			if (typeof loadedData?.enableBasesTaskListCustomView !== "boolean") {
				this.settings.enableBasesTaskListCustomView = legacyEnableBases;
			}
		}

		// Migration: old "show native toolbar" flag -> new "hide native toolbar" flag.
		const loadedSettings = loadedData as
			| (Partial<TaskNotesSettings> & {
					basesViewListShowNativeToolbar?: boolean;
			  })
			| null;
		if (
			typeof loadedSettings?.basesViewListHideNativeToolbar !== "boolean" &&
			typeof loadedSettings?.basesViewListShowNativeToolbar === "boolean"
		) {
			this.settings.basesViewListHideNativeToolbar = !loadedSettings.basesViewListShowNativeToolbar;
		}

		this.settings.uiLanguage = this.normalizeUILanguage(this.settings.uiLanguage);
		this.settings.enableBases = this.hasAnyFeatureEnabled();
	}

	async saveSettings() {
		this.settings.enableBases = this.hasAnyFeatureEnabled();
		this.settings.uiLanguage = this.normalizeUILanguage(this.settings.uiLanguage);
		await this.saveData(this.settings);
		this.i18n?.setLocale(this.settings.uiLanguage ?? "en");
		await this.syncBasesFeatureBindings();
		this.emitSettingsChanged();
		this.syncTaskNotesRuntimeBindings();
	}

	private normalizeUILanguage(language: string | null | undefined): string {
		if (typeof language === "string" && TaskNotesPlugin.SUPPORTED_UI_LANGUAGES.has(language)) {
			return language;
		}
		return "en";
	}

	private hasAnyFeatureEnabled(): boolean {
		return (
			this.settings.enableBasesViewListSidebar ||
			this.settings.enableBasesCustomTableView ||
			this.settings.enableBasesTaskListCustomView
		);
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

	hasTaskNotesRuntime(): boolean {
		return hasTaskNotesRuntime(this.app);
	}

	getTaskNotesRuntime(): TaskNotesRuntimeLike | null {
		return getTaskNotesRuntime(this.app);
	}

	private syncTaskNotesRuntimeBindings(): void {
		const runtime = this.getTaskNotesRuntime();
		this.taskNotesRuntime = runtime;

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
		const runtime = this.taskNotesRuntime ?? this.getTaskNotesRuntime();
		if (runtime) {
			return runtime;
		}
		throw new Error(`TaskNotes runtime is required for ${methodName}`);
	}

	async toggleRecurringTaskComplete(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("toggleRecurringTaskComplete");
		if (typeof runtime.toggleRecurringTaskComplete !== "function") {
			throw new Error("TaskNotes runtime does not provide toggleRecurringTaskComplete");
		}
		return runtime.toggleRecurringTaskComplete(...args);
	}

	async toggleTaskStatus(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("toggleTaskStatus");
		if (typeof runtime.toggleTaskStatus !== "function") {
			throw new Error("TaskNotes runtime does not provide toggleTaskStatus");
		}
		return runtime.toggleTaskStatus(...args);
	}

	async updateTaskProperty(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("updateTaskProperty");
		if (typeof runtime.updateTaskProperty !== "function") {
			throw new Error("TaskNotes runtime does not provide updateTaskProperty");
		}
		return runtime.updateTaskProperty(...args);
	}

	async openTaskEditModal(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("openTaskEditModal");
		if (typeof runtime.openTaskEditModal !== "function") {
			throw new Error("TaskNotes runtime does not provide openTaskEditModal");
		}
		return runtime.openTaskEditModal(...args);
	}

	async applyProjectSubtaskFilter(...args: unknown[]): Promise<unknown> {
		const runtime = this.runtimeOrError("applyProjectSubtaskFilter");
		if (typeof runtime.applyProjectSubtaskFilter !== "function") {
			throw new Error("TaskNotes runtime does not provide applyProjectSubtaskFilter");
		}
		return runtime.applyProjectSubtaskFilter(...args);
	}

	getActiveTimeSession(...args: unknown[]): unknown {
		const runtime = this.taskNotesRuntime ?? this.getTaskNotesRuntime();
		if (runtime && typeof runtime.getActiveTimeSession === "function") {
			return runtime.getActiveTimeSession(...args);
		}
		return null;
	}

	async openTagsPane(...args: unknown[]): Promise<boolean> {
		const runtime = this.taskNotesRuntime ?? this.getTaskNotesRuntime();
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
		const runtime = this.taskNotesRuntime ?? this.getTaskNotesRuntime();
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
