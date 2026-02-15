import { TFile, parseYaml, stringifyYaml } from "obsidian";
import TaskNotesPlugin from "../main";

export interface BaseViewRecord {
	name: string;
	type: string | null;
	raw: Record<string, unknown>;
}

interface CachedBaseYaml {
	mtime: number;
	root: Record<string, unknown>;
}

const VIEW_LIST_SIZE_KEY = "viewListSize";

export class BaseViewListYamlStore {
	private cache = new Map<string, CachedBaseYaml>();

	constructor(private plugin: TaskNotesPlugin) {}

	clearCache(filePath?: string): void {
		if (typeof filePath === "string" && filePath.length > 0) {
			this.cache.delete(filePath);
			return;
		}
		this.cache.clear();
	}

	async getViewListSizeRatio(file: TFile): Promise<number | null> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas);
			if (!formulas) return null;
			return this.normalizePositiveNumber(formulas[VIEW_LIST_SIZE_KEY]);
		} catch {
			return null;
		}
	}

	async setViewListSizeRatio(file: TFile, ratio: number | null): Promise<boolean> {
		try {
			const root = await this.readRoot(file);
			const formulas = this.asRecord(root.formulas) ?? {};
			const normalizedRatio = ratio == null ? null : this.roundRatio(ratio);
			const previousRatio = this.normalizePositiveNumber(formulas[VIEW_LIST_SIZE_KEY]);

			if (normalizedRatio == null) {
				if (typeof formulas[VIEW_LIST_SIZE_KEY] === "undefined") {
					return false;
				}
				delete formulas[VIEW_LIST_SIZE_KEY];
			} else {
				if (previousRatio === normalizedRatio) {
					return false;
				}
				formulas[VIEW_LIST_SIZE_KEY] = normalizedRatio;
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

	private async writeRoot(file: TFile, root: Record<string, unknown>): Promise<void> {
		const content = stringifyYaml(root);
		await this.plugin.app.vault.modify(file, content);
		this.cache.delete(file.path);
	}

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

	private asRecord(value: unknown): Record<string, unknown> | null {
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		return value as Record<string, unknown>;
	}

	private normalizeName(value: unknown): string {
		if (typeof value !== "string") return "";
		const name = value.trim();
		return name.length > 0 ? name : "";
	}

	private normalizeType(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const type = value.trim();
		return type.length > 0 ? type : null;
	}

	private normalizeText(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const text = value.trim();
		return text.length > 0 ? text : null;
	}

	private normalizePositiveNumber(value: unknown): number | null {
		if (typeof value === "number" && Number.isFinite(value) && value > 0) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = Number.parseFloat(value);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return null;
	}

	private roundRatio(value: number): number {
		return Math.round(value * 1000) / 1000;
	}
}
