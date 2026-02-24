import { TaskInfo } from '../types';

/**
 * TaskSearchFilter - Filters tasks based on search term across visible columns
 * 
 * Implements ephemeral filtering (non-destructive) with case-insensitive full-text search.
 * Follows Single Responsibility Principle - only handles search/filter logic.
 */
// TaskList向けに可視プロパティを含む全文検索フィルタを提供する。
export class TaskSearchFilter {
	private visibleProperties: string[];

	/**
	 * @param visibleProperties - Optional array of custom property IDs to include in search
	 */
	// 検索対象に含めるカスタムプロパティID一覧を初期化する。
	constructor(visibleProperties?: string[]) {
		this.visibleProperties = visibleProperties || [];
	}

	/**
	 * Filter tasks based on search term
	 * 
	 * @param tasks - Array of tasks to filter
	 * @param searchTerm - Search term to match against
	 * @returns Filtered array of tasks matching the search term
	 */
	// 検索語に一致するタスクだけを抽出して返す。
	filterTasks(tasks: TaskInfo[], searchTerm: string): TaskInfo[] {
		const normalizedTerm = this.normalizeSearchTerm(searchTerm);
		
		// Empty search term returns all tasks
		if (!normalizedTerm) {
			return tasks;
		}

		return tasks.filter(task => {
			const searchableText = this.extractSearchableText(task);
			return searchableText.includes(normalizedTerm);
		});
	}

	/**
	 * Extract searchable text from a task
	 * Combines all searchable fields into a single lowercase string
	 * 
	 * @param task - Task to extract searchable text from
	 * @returns Lowercase searchable text
	 */
	// タスクの検索対象フィールドを連結し比較用テキストへ変換する。
	private extractSearchableText(task: TaskInfo): string {
		// 例外発生を考慮した処理フローをまとめ、失敗時の後始末を保証する。
		const parts: string[] = [];

		// Core fields - always searched
		parts.push(task.title || '');
		parts.push(task.status || '');
		parts.push(task.priority || '');

		// Array fields - join with spaces
		if (task.tags && Array.isArray(task.tags)) {
			parts.push(task.tags.join(' '));
		}

		if (task.contexts && Array.isArray(task.contexts)) {
			parts.push(task.contexts.join(' '));
		}

		if (task.projects && Array.isArray(task.projects)) {
			parts.push(task.projects.join(' '));
		}

		// Custom properties - only if in visibleProperties
		if (task.customProperties && this.visibleProperties.length > 0) {
			for (const propertyId of this.visibleProperties) {
				const value = task.customProperties[propertyId];
				if (value !== undefined && value !== null) {
					// Handle both string and array values
					if (Array.isArray(value)) {
						parts.push(value.join(' '));
					} else {
						parts.push(String(value));
					}
				}
			}
		}

		// Join all parts and normalize
		return parts.join(' ').toLowerCase();
	}

	/**
	 * Normalize search term for matching
	 * 
	 * @param term - Raw search term
	 * @returns Normalized (trimmed, lowercase) search term
	 */
	// 検索語をtrim+小文字化して比較用に正規化する。
	private normalizeSearchTerm(term: string): string {
		return term.trim().toLowerCase();
	}
}

