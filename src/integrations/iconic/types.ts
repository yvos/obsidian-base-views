export interface IconicFileIconDescriptor {
	icon: string;
	color?: string;
}

export interface IconicFileIconSource {
	icon?: unknown;
	color?: unknown;
}

export interface IconicRuleManagerLike {
	checkRuling?: (page: string, itemId: string) => unknown;
}

export interface IconicPluginLike {
	ruleManager?: IconicRuleManagerLike;
	getFileItem?: (...args: unknown[]) => unknown;
	settings?: {
		fileIcons?: Record<string, IconicFileIconSource>;
	};
}
