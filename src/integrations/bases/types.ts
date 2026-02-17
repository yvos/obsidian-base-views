export type NativeViewSettingsOpenStatus =
	| "opened-settings"
	| "opened-view-list-only"
	| "failed";

export interface NativeViewSettingsOpenResult {
	status: NativeViewSettingsOpenStatus;
	reason?: string;
}

export interface OpenNativeViewSettingsAtAnchorParams {
	rootEl: HTMLElement;
	viewName: string;
	anchorEl: HTMLElement;
	nativeToolbarHiddenClass?: string;
}
