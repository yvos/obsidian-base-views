import { Events, Notice, Plugin, getLanguage } from "obsidian";
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
	private basesViewListSidebarService: BasesViewListSidebarService | null = null;

	private getSystemUILocale(): string {
		try {
			const obsidianLanguage = getLanguage();
			if (obsidianLanguage) {
				return obsidianLanguage;
			}
		} catch {
			// no-op
		}

		if (typeof navigator !== "undefined" && navigator.language) {
			return navigator.language;
		}

		return "en";
	}

	async onload() {
		await this.loadSettings();

		this.i18n = createI18nService({
			initialLocale: this.settings.uiLanguage ?? "system",
			getSystemLocale: () => this.getSystemUILocale(),
		});

		this.fieldMapper = new FieldMapper(this.settings.fieldMapping);
		this.emitter = this.localEmitter;
		this.syncTaskNotesRuntimeBindings();

		this.addSettingTab(new BaseViewsSettingTab(this.app, this));

		if (this.settings.enableBases) {
			await registerBasesTaskList(this);
			this.basesRegistered = true;
		}

		this.basesViewListSidebarService = new BasesViewListSidebarService(this);
		this.basesViewListSidebarService.start();

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

		if (this.settings.enableBases && this.basesRegistered) {
			unregisterBasesViews(this);
			this.basesRegistered = false;
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData || {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.i18n?.setLocale(this.settings.uiLanguage ?? "system");
		this.emitSettingsChanged();
		this.syncTaskNotesRuntimeBindings();
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
