import TaskNotesPlugin from "../main";
import { PriorityConfig } from "../types";
import { ContextMenu } from "./ContextMenu";

export interface PriorityContextMenuOptions {
	currentValue?: string;
	onSelect: (value: string) => void;
	plugin: TaskNotesPlugin;
}

// PriorityContextMenuの中核ロジックをまとめるクラス。
export class PriorityContextMenu {
	private menu: ContextMenu;
	private options: PriorityContextMenuOptions;
	private sortedPriorities: PriorityConfig[];
	private targetDoc: Document = document;

	constructor(options: PriorityContextMenuOptions) {
		this.menu = new ContextMenu();
		this.options = options;
		this.buildMenu();
	}

	private buildMenu(): void {
		// 複数のUI要素生成とイベント接続をまとめて行い、表示初期化を安定させる。
		const priorities = this.options.plugin.settings.customPriorities;

		// Sort by weight (higher weight = more important)
		this.sortedPriorities = [...priorities].sort((a, b) => b.weight - a.weight);

		this.sortedPriorities.forEach((priority) => {
			this.menu.addItem((item) => {
				let title = priority.label;

				// Use consistent icon for all items
				item.setIcon("star");

				// Highlight current selection with visual indicator
				if (priority.value === this.options.currentValue) {
					title = `✓ ${priority.label}`;
				}

				item.setTitle(title);

				item.onClick(async () => {
					this.options.onSelect(priority.value);
				});
			});
		});
	}

	public show(event: UIEvent): void {
		// Store the document reference from the event target to support pop-out windows
		// Use cross-window compatible instanceOf check
		if ((event.target as Node)?.instanceOf?.(HTMLElement)) {
			this.targetDoc = (event.target as HTMLElement).ownerDocument;
		}
		this.menu.show(event);

		// Apply color styling after menu is shown
		setTimeout(() => {
			this.applyColorStyling();
		}, 10);
	}

	private applyColorStyling(): void {
		// 条件分岐に応じて状態更新と副作用処理を段階的に適用する。
		const menuEl = this.targetDoc.querySelector(".menu");

		if (!menuEl) return;

		const menuItems = menuEl.querySelectorAll(".menu-item");

		this.sortedPriorities.forEach((priority, index) => {
			const menuItem = menuItems[index] as HTMLElement;
			if (menuItem && priority.color) {
				const iconEl = menuItem.querySelector(".menu-item-icon");
				if (iconEl) {
					(iconEl as HTMLElement).style.color = priority.color;
				}
			}
		});
	}
}
