import { TFile, parseYaml, stringifyYaml } from "obsidian";
import TaskNotesPlugin from "../main";

// `.base` 内の `views[]` 要素から抽出したビュー情報を表す。
export interface BaseViewRecord {
	name: string;
	type: string | null;
	raw: Record<string, unknown>;
}

// view一覧配置の保存値として扱う配置種別を表す。
export type ViewListFormulaPlacement = "left" | "top" | "none";
// view一覧配置の対象コンテキスト（通常ペイン/サイドペイン）を表す。
export type ViewListFormulaContext = "normal" | "sidePane";
// top配置時のオーバーフローモード保存値を表す。
export type ViewListFormulaTopOverflowMode = "wrap" | "scroll";

// `.base formulas` に保存するview一覧関連の設定値群を表す。
export interface BaseViewListFormulaPrefs {
	position: ViewListFormulaPlacement | null;
	sidePanePosition: ViewListFormulaPlacement | null;
	showProperty: boolean | null;
	propertyKey: string | null;
	topOverflowMode: ViewListFormulaTopOverflowMode | null;
}

// `.base` YAMLパース結果のキャッシュエントリを保持する。
interface CachedBaseYaml {
	mtime: number;
	root: Record<string, unknown>;
}

const VIEW_LIST_SIZE_KEY = "viewListSize";
const VIEW_LIST_POSITION_KEY = "tnViewListPosition";
const VIEW_LIST_SIDE_PANE_POSITION_KEY = "tnViewListSidePanePosition";
const VIEW_LIST_SHOW_PROPERTY_KEY = "tnViewListShowProperty";
const VIEW_LIST_PROPERTY_KEY = "tnViewListPropertyKey";
const VIEW_LIST_TOP_OVERFLOW_KEY = "tnViewListTopOverflowMode";

// `.base` YAMLのview一覧関連キーを読み書きするストアを提供する。
export class BaseViewListYamlStore {
	private cache = new Map<string, CachedBaseYaml>();

	// YAMLアクセスに必要なplugin参照を受け取りストアを初期化する。
	constructor(private plugin: TaskNotesPlugin) {}

	// 指定ファイルまたは全件のYAMLキャッシュを破棄する。
	clearCache(filePath?: string): void {
		if (typeof filePath === "string" && filePath.length > 0) {
			this.cache.delete(filePath);
			return;
		}
		this.cache.clear();
	}

	// `.base formulas` からview一覧設定一式を読み出す。
	async getViewListFormulaPrefs(file: TFile): Promise<BaseViewListFormulaPrefs> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas);
			if (!formulas) {
				return this.createEmptyViewListFormulaPrefs();
			}
			return {
				position: this.parseViewListPlacement(formulas[VIEW_LIST_POSITION_KEY]),
				sidePanePosition: this.parseViewListPlacement(
					formulas[VIEW_LIST_SIDE_PANE_POSITION_KEY]
				),
				showProperty: this.parseBoolean(formulas[VIEW_LIST_SHOW_PROPERTY_KEY]),
				propertyKey: this.normalizeText(formulas[VIEW_LIST_PROPERTY_KEY]),
				topOverflowMode: this.parseTopOverflowMode(formulas[VIEW_LIST_TOP_OVERFLOW_KEY]),
			};
		} catch {
			return this.createEmptyViewListFormulaPrefs();
		}
	}

	// 指定コンテキストのview一覧配置を `.base formulas` に保存する。
	async setViewListPosition(
		file: TFile,
		context: ViewListFormulaContext,
		value: ViewListFormulaPlacement | null
	): Promise<boolean> {
		const key =
			context === "sidePane"
				? VIEW_LIST_SIDE_PANE_POSITION_KEY
				: VIEW_LIST_POSITION_KEY;
		const normalized = this.normalizeViewListPlacement(value);
		return this.updateFormulaField(
			file,
			key,
			normalized ?? undefined,
			(current) => this.parseViewListPlacement(current) === normalized,
			"[TaskNotes][Bases] Failed to update view list position formula"
		);
	}

	// viewごとのプロパティ表示ON/OFFを `.base formulas` に保存する。
	async setViewListShowProperty(file: TFile, value: boolean | null): Promise<boolean> {
		const normalized = this.normalizeBooleanFormulaString(value);
		return this.updateFormulaField(
			file,
			VIEW_LIST_SHOW_PROPERTY_KEY,
			normalized ?? undefined,
			(current) => this.normalizeBooleanFormulaString(current) === normalized,
			"[TaskNotes][Bases] Failed to update view list showProperty formula"
		);
	}

	// 表示対象プロパティキーを `.base formulas` に保存する。
	async setViewListPropertyKey(file: TFile, value: string | null): Promise<boolean> {
		const normalized = this.normalizeText(value);
		return this.updateFormulaField(
			file,
			VIEW_LIST_PROPERTY_KEY,
			normalized ?? undefined,
			(current) => this.normalizeText(current) === normalized,
			"[TaskNotes][Bases] Failed to update view list property key formula"
		);
	}

	// top配置時のoverflowモードを `.base formulas` に保存する。
	async setViewListTopOverflowMode(
		file: TFile,
		value: ViewListFormulaTopOverflowMode | null
	): Promise<boolean> {
		const normalized = this.parseTopOverflowMode(value);
		return this.updateFormulaField(
			file,
			VIEW_LIST_TOP_OVERFLOW_KEY,
			normalized ?? undefined,
			(current) => this.parseTopOverflowMode(current) === normalized,
			"[TaskNotes][Bases] Failed to update view list top overflow formula"
		);
	}

	// view一覧の保存幅比率（formulas.viewListSize）を取得する。
	async getViewListSizeRatio(file: TFile): Promise<number | null> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas);
			if (!formulas) return null;
			return this.parsePositiveRatio(formulas[VIEW_LIST_SIZE_KEY]);
		} catch {
			return null;
		}
	}

	// view一覧の保存幅比率（formulas.viewListSize）を更新する。
	async setViewListSizeRatio(file: TFile, ratio: number | null): Promise<boolean> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas) ?? {};
			const normalizedRatio = ratio == null ? null : this.roundRatio(ratio);
			const nextRatioText =
				normalizedRatio == null ? null : this.formatRatioString(normalizedRatio);
			const currentRaw = formulas[VIEW_LIST_SIZE_KEY];
			const previousRatioText = this.normalizeRatioText(currentRaw);

			if (nextRatioText == null) {
				if (typeof formulas[VIEW_LIST_SIZE_KEY] === "undefined") {
					return false;
				}
				delete formulas[VIEW_LIST_SIZE_KEY];
			} else {
				// Keep formulas.viewListSize as string to satisfy Bases schema.
				if (typeof currentRaw === "string" && previousRatioText === nextRatioText) {
					return false;
				}
				formulas[VIEW_LIST_SIZE_KEY] = nextRatioText;
			}

			if (Object.keys(formulas).length === 0) {
				delete root.formulas;
			} else {
				root.formulas = formulas;
			}

			await this.writeRoot(file, root);
			return true;
		} catch (error) {
			console.warn("[TaskNotes][Bases] Failed to update formulas.viewListSize", error);
			return false;
		}
	}

	// `.base` 内 `views[]` を走査してビュー名・type一覧を返す。
	async getViews(file: TFile): Promise<BaseViewRecord[]> {
		try {
			const root = await this.readRoot(file);
			const views = Array.isArray(root.views) ? root.views : [];
			const result: BaseViewRecord[] = [];

			for (const view of views) {
				const record = this.asRecord(view);
				if (!record) continue;
				const name = this.normalizeName(record.name);
				if (!name) continue;
				const type = this.normalizeType(record.type);
				result.push({ name, type, raw: record });
			}

			return result;
		} catch {
			return [];
		}
	}

	// 指定ビューのdescriptionを `.base views[]` へ書き戻す。
	async updateViewDescription(
		file: TFile,
		viewName: string,
		description: string | null
	): Promise<boolean> {
		const targetName = this.normalizeName(viewName);
		if (!targetName) return false;

		try {
			const root = await this.readRoot(file);
			const views = Array.isArray(root.views) ? root.views : null;
			if (!views) return false;

			let changed = false;

			for (const view of views) {
				const record = this.asRecord(view);
				if (!record) continue;
				const name = this.normalizeName(record.name);
				if (name !== targetName) continue;

				const current = this.normalizeText(record.description);
				const next = this.normalizeText(description);

				if (next == null) {
					if (typeof record.description !== "undefined") {
						delete record.description;
						changed = true;
					}
				} else if (current !== next) {
					record.description = next;
					changed = true;
				}
				break;
			}

			if (!changed) return false;
			await this.writeRoot(file, root);
			return true;
		} catch (error) {
			console.warn("[TaskNotes][Bases] Failed to update view description", error);
			return false;
		}
	}

	// `.base` ファイルを読み込み、mtime連動キャッシュ経由でrootを返す。
	private async readRoot(file: TFile): Promise<Record<string, unknown>> {
		const mtime = Number(file.stat?.mtime ?? 0);
		const cached = this.cache.get(file.path);
		if (cached && cached.mtime === mtime) {
			return this.cloneRecord(cached.root);
		}

		const content = await this.plugin.app.vault.cachedRead(file);
		const parsed = parseYaml(content);
		const root = this.asRecord(parsed) ?? {};

		this.cache.set(file.path, {
			mtime,
			root: this.cloneRecord(root),
		});

		return this.cloneRecord(root);
	}

	// 更新したrootオブジェクトをYAMLへシリアライズして保存する。
	private async writeRoot(file: TFile, root: Record<string, unknown>): Promise<void> {
		const content = stringifyYaml(root);
		await this.plugin.app.vault.modify(file, content);
		this.cache.delete(file.path);
	}

	// YAML rootオブジェクトを安全に複製して参照共有を避ける。
	private cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
		try {
			const maybeStructuredClone = (globalThis as { structuredClone?: <T>(input: T) => T })
				.structuredClone;
			if (typeof maybeStructuredClone === "function") {
				return maybeStructuredClone(value);
			}
		} catch {
			// Ignore and fall back to JSON clone.
		}

		return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
	}

	// unknown値をRecord型へ安全に絞り込む。
	private asRecord(value: unknown): Record<string, unknown> | null {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	}

	// ビュー名として扱える文字列をトリムして返す。
	private normalizeName(value: unknown): string {
		if (typeof value !== "string") return "";
		const name = value.trim();
		return name.length > 0 ? name : "";
	}

	// ビューtypeとして扱える文字列をトリムして返す。
	private normalizeType(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const type = value.trim();
		return type.length > 0 ? type : null;
	}

	// 空文字を除外した一般テキスト値へ正規化する。
	private normalizeText(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const text = value.trim();
		return text.length > 0 ? text : null;
	}

	// 真偽値保存文字列を boolean | null へ変換する。
	private parseBoolean(value: unknown): boolean | null {
		const normalized = this.normalizeBooleanFormulaString(value);
		if (normalized === "true") return true;
		if (normalized === "false") return false;
		return null;
	}

	// booleanまたは文字列を formulas保存互換の "true"/"false" へ正規化する。
	private normalizeBooleanFormulaString(value: unknown): "true" | "false" | null {
		if (typeof value === "boolean") {
			// Backward compatibility: legacy boolean values are accepted on read.
			return value ? "true" : "false";
		}
		if (typeof value !== "string") return null;
		const normalized = value.trim().toLowerCase();
		if (normalized === "true" || normalized === "false") {
			return normalized;
		}
		return null;
	}

	// view一覧配置の保存文字列を有効値へ正規化する。
	private parseViewListPlacement(value: unknown): ViewListFormulaPlacement | null {
		if (typeof value !== "string") return null;
		const normalized = value.trim().toLowerCase();
		if (normalized === "left" || normalized === "top" || normalized === "none") {
			return normalized;
		}
		return null;
	}

	// 入力値をview一覧配置の保存値へ正規化する。
	private normalizeViewListPlacement(value: unknown): ViewListFormulaPlacement | null {
		return this.parseViewListPlacement(value);
	}

	// top配置のoverflowモード保存文字列を有効値へ正規化する。
	private parseTopOverflowMode(value: unknown): ViewListFormulaTopOverflowMode | null {
		if (typeof value !== "string") return null;
		const normalized = value.trim().toLowerCase();
		if (normalized === "wrap" || normalized === "scroll") {
			return normalized;
		}
		return null;
	}

	// formulas未設定時に返す空の既定設定オブジェクトを生成する。
	private createEmptyViewListFormulaPrefs(): BaseViewListFormulaPrefs {
		return {
			position: null,
			sidePanePosition: null,
			showProperty: null,
			propertyKey: null,
			topOverflowMode: null,
		};
	}

	// formulas配下の単一キー更新と不要キー削除を共通化する。
	private async updateFormulaField(
		file: TFile,
		key: string,
		nextValue: unknown | undefined,
		equals: (current: unknown) => boolean,
		warnMessage: string
	): Promise<boolean> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas) ?? {};
			const hasCurrent = Object.prototype.hasOwnProperty.call(formulas, key);
			const currentRaw = hasCurrent ? formulas[key] : undefined;

			if (typeof nextValue === "undefined") {
				if (!hasCurrent) return false;
				delete formulas[key];
			} else {
				if (hasCurrent && equals(currentRaw)) {
					return false;
				}
				formulas[key] = nextValue;
			}

			if (Object.keys(formulas).length === 0) {
				delete root.formulas;
			} else {
				root.formulas = formulas;
			}

			await this.writeRoot(file, root);
			return true;
		} catch (error) {
			console.warn(warnMessage, error);
			return false;
		}
	}

	// 幅比率値を正の数値へパースできる場合に返す。
	private parsePositiveRatio(value: unknown): number | null {
		if (typeof value === "string") {
			const parsed = Number.parseFloat(value);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		if (typeof value === "number" && Number.isFinite(value) && value > 0) {
			return value;
		}
		return null;
	}

	// 幅比率値を正規化済みの文字列表現へ変換する。
	private normalizeRatioText(value: unknown): string | null {
		const parsed = this.parsePositiveRatio(value);
		if (parsed == null) return null;
		return this.formatRatioString(this.roundRatio(parsed));
	}

	// 幅比率を保存精度（小数3桁）に丸める。
	private roundRatio(value: number): number {
		return Math.round(value * 1000) / 1000;
	}

	// 幅比率を末尾ゼロを除いた保存文字列へ整形する。
	private formatRatioString(value: number): string {
		return value.toFixed(3).replace(/\.?0+$/, "");
	}
}
