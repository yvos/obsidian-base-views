import { App, Modal } from "obsidian";
import { toCssRgb } from "../bases/viewColorUtils";

export interface RgbColorInputModalOptions {
	title: string;
	confirmText?: string;
	cancelText?: string;
	redLabel?: string;
	greenLabel?: string;
	blueLabel?: string;
	initialValue?: string | null;
}

export class RgbColorInputModal extends Modal {
	private resolveValue: (value: string | null) => void = () => {};
	private isResolved = false;
	private redInputEl: HTMLInputElement | null = null;
	private greenInputEl: HTMLInputElement | null = null;
	private blueInputEl: HTMLInputElement | null = null;
	private errorEl: HTMLElement | null = null;

	constructor(app: App, private readonly options: RgbColorInputModalOptions) {
		super(app);
	}

	show(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolveValue = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		const titleEl = contentEl.createEl("h2", { text: this.options.title });
		titleEl.className = "bv-rgb-modal-title";

		const parsedInitial = this.parseInitialValue(this.options.initialValue);
		this.redInputEl = this.createNumberInputRow(
			contentEl,
			this.options.redLabel ?? "R",
			parsedInitial?.r ?? 0
		);
		this.greenInputEl = this.createNumberInputRow(
			contentEl,
			this.options.greenLabel ?? "G",
			parsedInitial?.g ?? 0
		);
		this.blueInputEl = this.createNumberInputRow(
			contentEl,
			this.options.blueLabel ?? "B",
			parsedInitial?.b ?? 0
		);

		this.errorEl = contentEl.createDiv({ cls: "bv-rgb-modal-error" });
		this.errorEl.style.display = "none";

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
		buttonContainer.style.display = "flex";
		buttonContainer.style.gap = "10px";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.marginTop = "16px";

		const cancelButton = buttonContainer.createEl("button", {
			text: this.options.cancelText ?? "Cancel",
		});
		cancelButton.addEventListener("click", () => {
			this.finish(null);
		});

		const confirmButton = buttonContainer.createEl("button", {
			text: this.options.confirmText ?? "OK",
			cls: "mod-cta",
		});
		confirmButton.addEventListener("click", () => {
			this.handleConfirm();
		});

		const keydownHandler = (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				evt.preventDefault();
				this.handleConfirm();
				return;
			}
			if (evt.key === "Escape") {
				evt.preventDefault();
				this.finish(null);
			}
		};

		this.redInputEl.addEventListener("keydown", keydownHandler);
		this.greenInputEl.addEventListener("keydown", keydownHandler);
		this.blueInputEl.addEventListener("keydown", keydownHandler);

		window.setTimeout(() => {
			this.redInputEl?.focus();
			this.redInputEl?.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.isResolved) {
			this.resolveValue(null);
			this.isResolved = true;
		}
	}

	private createNumberInputRow(
		parentEl: HTMLElement,
		labelText: string,
		initialValue: number
	): HTMLInputElement {
		const rowEl = parentEl.createDiv({ cls: "bv-rgb-modal-row" });
		rowEl.style.display = "flex";
		rowEl.style.alignItems = "center";
		rowEl.style.gap = "8px";
		rowEl.style.marginBottom = "8px";

		const labelEl = rowEl.createEl("label", { text: labelText });
		labelEl.style.minWidth = "18px";

		const inputEl = rowEl.createEl("input");
		inputEl.type = "number";
		inputEl.min = "0";
		inputEl.max = "255";
		inputEl.step = "1";
		inputEl.value = String(initialValue);
		inputEl.style.width = "100%";

		return inputEl;
	}

	private parseInitialValue(value: string | null | undefined): { r: number; g: number; b: number } | null {
		if (typeof value !== "string") return null;
		const match = value.trim().match(
			/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
		);
		if (!match) return null;
		const r = Number.parseInt(match[1], 10);
		const g = Number.parseInt(match[2], 10);
		const b = Number.parseInt(match[3], 10);
		if (!this.isValidChannel(r) || !this.isValidChannel(g) || !this.isValidChannel(b)) {
			return null;
		}
		return { r, g, b };
	}

	private handleConfirm(): void {
		const r = this.parseChannel(this.redInputEl?.value);
		const g = this.parseChannel(this.greenInputEl?.value);
		const b = this.parseChannel(this.blueInputEl?.value);

		if (r == null || g == null || b == null) {
			this.showError("Enter integers in the range 0-255.");
			return;
		}

		this.hideError();
		this.finish(
			toCssRgb({
				r,
				g,
				b,
			})
		);
	}

	private parseChannel(value: string | undefined): number | null {
		if (typeof value !== "string" || value.trim().length === 0) return null;
		const parsed = Number.parseInt(value.trim(), 10);
		if (!this.isValidChannel(parsed)) return null;
		return parsed;
	}

	private isValidChannel(value: number): boolean {
		return Number.isInteger(value) && value >= 0 && value <= 255;
	}

	private showError(message: string): void {
		if (!this.errorEl) return;
		this.errorEl.textContent = message;
		this.errorEl.style.display = "block";
	}

	private hideError(): void {
		if (!this.errorEl) return;
		this.errorEl.textContent = "";
		this.errorEl.style.display = "none";
	}

	private finish(value: string | null): void {
		if (!this.isResolved) {
			this.resolveValue(value);
			this.isResolved = true;
		}
		this.close();
	}
}

export async function showRgbColorInputModal(
	app: App,
	options: RgbColorInputModalOptions
): Promise<string | null> {
	const modal = new RgbColorInputModal(app, options);
	return modal.show();
}
