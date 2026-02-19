// ネイティブview設定起動の結果状態を表す。
export type NativeViewSettingsOpenStatus =
	| "opened-settings"
	| "opened-view-list-only"
	| "failed";

// ネイティブview設定起動処理の結果オブジェクトを表す。
export interface NativeViewSettingsOpenResult {
	status: NativeViewSettingsOpenStatus;
	reason?: string;
}

// ネイティブview設定起動ブリッジへ渡す入力パラメータを表す。
export interface OpenNativeViewSettingsAtAnchorParams {
	rootEl: HTMLElement;
	viewName: string;
	anchorEl: HTMLElement;
	nativeToolbarHiddenClass?: string;
}
