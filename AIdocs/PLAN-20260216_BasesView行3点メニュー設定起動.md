# PLAN-20260216 BasesView行3点メニュー設定起動

## 目的
- TaskNotes の Bases view一覧の各行右端に 3点メニューを追加し、そこからオリジナル Bases の view 設定UIを開く導線を提供する。
- 失敗時は Notice 表示のうえ、既存の view行コンテキストメニューへフォールバックし、操作不能状態を避ける。

## 方針
- 内部DOM/内部UI依存を `src/integrations/bases/nativeViewSettingsBridge.ts` に隔離する。
- `openNativeViewSettingsAtAnchor()` は防御的に実装し、必ず
  - `opened-settings`
  - `opened-view-list-only`
  - `failed`
  のいずれかを返す。
- 3点ボタンは「ホバー時 + フォーカス時」表示とし、常時表示にはしない。
- 既存の view切替・右クリックメニュー・再描画系は回帰させない。

## 実装タスク
- [x] `src/integrations/bases/types.ts` を新規作成し、結果型と入力型を定義
- [x] `src/integrations/bases/nativeViewSettingsBridge.ts` を新規作成し、ネイティブ設定起動ブリッジを実装
- [x] `src/bases/BasesViewListSidebarService.ts` に3点ボタン導線を追加
- [x] `src/bases/BasesViewListSidebarService.ts` に Notice + フォールバック表示を追加
- [x] `src/bases/BasesViewListSidebarService.ts` の `contextmenu` 判定を行ラッパー対応に更新
- [x] `styles/bases-views.css` に行ラッパー/3点ボタン表示制御スタイルを追加
- [x] `src/i18n/resources/en.ts` に3点ボタン/Notice文言キーを追加
- [x] `src/i18n/resources/ja.ts` に3点ボタン/Notice文言キーを追加
- [x] `tests/unit/integrations/bases/nativeViewSettingsBridge.test.ts` を新規追加
- [x] `tests/unit/bases/BasesViewListSidebarService.test.ts` に3点ボタンの回帰防止テストを追加
- [x] `AIdocs/IMPLEMENTATION.md` を更新
- [x] `AIdocs/LOG-20260216.md` を更新
- [x] 本PLANファイルを追加し、完了状態を反映

## 受け入れ条件
- 各view行に3点ボタンが描画される（hover/focusで表示）。
- 3点クリック時に view 切替（`selectView` / `openLinkText`）が走らない。
- ネイティブ設定UI起動成功時はフォールバックメニューを出さない。
- `opened-view-list-only` / `failed` 時は Notice 表示 + フォールバックメニュー表示になる。
- 既存の右クリックメニュー挙動が維持される。

## 検証メモ
- 実施: 静的確認、ユニットテスト追加/更新。
- 未実施: `npm test` / `npm run typecheck`（この環境では `npm: command not found`）。
