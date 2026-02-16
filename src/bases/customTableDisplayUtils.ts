export function formatGroupTitleWithProperty(
	groupValueTitle: string,
	propertyDisplayName: string | null,
	showPropertyName: boolean
): string {
	if (!showPropertyName) return groupValueTitle;

	const propertyLabel = propertyDisplayName?.trim();
	if (!propertyLabel) return groupValueTitle;

	const normalizedGroupTitle = groupValueTitle.trim().toLowerCase();
	const normalizedPrefix = `${propertyLabel.toLowerCase()}:`;
	if (normalizedGroupTitle.startsWith(normalizedPrefix)) {
		return groupValueTitle;
	}

	return `${propertyLabel}: ${groupValueTitle}`;
}
