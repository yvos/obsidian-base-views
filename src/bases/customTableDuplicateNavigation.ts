export interface DuplicateNavigationIndex {
	rowOrdersByPath: Map<string, number[]>;
}

export function createEmptyDuplicateNavigationIndex(): DuplicateNavigationIndex {
	return {
		rowOrdersByPath: new Map<string, number[]>(),
	};
}

export function buildDuplicateNavigationIndex(
	filePathsInRenderOrder: Array<string | null | undefined>
): DuplicateNavigationIndex {
	const index = createEmptyDuplicateNavigationIndex();

	for (let rowOrder = 0; rowOrder < filePathsInRenderOrder.length; rowOrder++) {
		const rawPath = filePathsInRenderOrder[rowOrder];
		if (typeof rawPath !== "string") continue;
		const filePath = rawPath.trim();
		if (filePath.length === 0) continue;

		const existing = index.rowOrdersByPath.get(filePath);
		if (existing) {
			existing.push(rowOrder);
			continue;
		}

		index.rowOrdersByPath.set(filePath, [rowOrder]);
	}

	return index;
}

export function hasDuplicateNavigationTarget(
	index: DuplicateNavigationIndex,
	filePath: string
): boolean {
	const rowOrders = index.rowOrdersByPath.get(filePath);
	return Array.isArray(rowOrders) && rowOrders.length > 1;
}

export function getNextDuplicateRowOrder(
	index: DuplicateNavigationIndex,
	filePath: string,
	currentRowOrder: number
): number | null {
	const rowOrders = index.rowOrdersByPath.get(filePath);
	if (!Array.isArray(rowOrders) || rowOrders.length <= 1) return null;

	const currentIndex = rowOrders.indexOf(currentRowOrder);
	if (currentIndex < 0) {
		return rowOrders[0] ?? null;
	}

	const nextIndex = (currentIndex + 1) % rowOrders.length;
	return rowOrders[nextIndex] ?? null;
}
