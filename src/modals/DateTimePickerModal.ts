import { App, Modal, Setting } from "obsidian";

export interface DateTimePickerOptions {
	currentDate?: string | null;
	currentTime?: string | null;
	title?: string;
	onSelect: (date: string | null, time: string | null) => void;
}

/**
 * Simple modal for picking date and time using native Obsidian components
 */
// ユーザー確認や入力フローを担うモーダルコンポーネント。
export class DateTimePickerModal extends Modal {
	private options: DateTimePickerOptions;
	private dateInput: HTMLInputElement;
	private timeInput: HTMLInputElement;

	constructor(app: App, options: DateTimePickerOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("date-time-picker-modal");

		// Title
		if (this.options.title) {
			contentEl.createEl("h3", { text: this.options.title });
		}

		// Date input
		new Setting(contentEl)
			.setName("Date")
			.addText((text) => {
				this.dateInput = text.inputEl;
				this.dateInput.type = "date";
				if (this.options.currentDate) {
					this.dateInput.value = this.options.currentDate;
				}
			});

		// Time input (optional)
		new Setting(contentEl)
			.setName("Time (optional)")
			.addText((text) => {
				this.timeInput = text.inputEl;
				this.timeInput.type = "time";
				if (this.options.currentTime) {
					this.timeInput.value = this.options.currentTime;
				}
			});

		// Buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Cancel")
					.onClick(() => {
						this.close();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Select")
					.setCta()
					.onClick(() => {
						const date = this.dateInput.value || null;
						const time = this.timeInput.value || null;
						this.options.onSelect(date, time);
						this.close();
					})
			);

		// Focus date input
		setTimeout(() => {
			this.dateInput.focus();
		}, 100);

		// Handle Enter key
		const handleEnter = (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				const date = this.dateInput.value || null;
				const time = this.timeInput.value || null;
				this.options.onSelect(date, time);
				this.close();
			}
		};

		this.dateInput.addEventListener("keydown", handleEnter);
		this.timeInput.addEventListener("keydown", handleEnter);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
