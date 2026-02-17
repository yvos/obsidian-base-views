# PLAN-20260217 BasesView行3点メニュー設定再改善

## 目的
- TaskNotes の Bases view一覧で、各行の3点ボタンからネイティブview設定UI（右端chevron経路）を安定して開けるようにする。
- `opened-view-list-only` / `failed` 時に既存コンテキストメニューを重ねて出すフォールバックを廃止し、Noticeのみで通知する。

## 調査結果（2026-02-17）
- ネイティブviewsメニューは `.menu-item` ではなく `.bases-toolbar-menu-item`（`suggestion-item`）構造。
- 各view右端の設定起動は `.clickable-icon.bases-toolbar-menu-item-icon`（`lucide-chevron-right`）で実行される。
- 設定UI遷移は「サブメニュー追加」ではなく、同一メニュー内が `view-config-menu` 状態へ切り替わる。

## 方針
- `src/integrations/bases/nativeViewSettingsBridge.ts` を実DOM仕様に合わせて更新する。
- 成功判定を「メニュー数増加」依存から、`view-config-menu` 等の状態遷移検出へ拡張する。
- `src/bases/BasesViewListSidebarService.ts` の item menu 失敗時フォールバックメニューを削除する。

## 実装タスク
- [x] `src/integrations/bases/nativeViewSettingsBridge.ts` の row探索セレクタを `.bases-toolbar-menu-item` 系に対応
- [x] `src/integrations/bases/nativeViewSettingsBridge.ts` の設定UI成功判定を `view-config-menu` 遷移検出へ更新
- [x] `src/bases/BasesViewListSidebarService.ts` の `showViewItemContextMenuAtAnchor` 依存を削除
- [x] `src/bases/BasesViewListSidebarService.ts` の Notice文言をfallback非依存へ更新
- [x] `tests/unit/integrations/bases/nativeViewSettingsBridge.test.ts` を同一メニュー遷移ケース中心に更新
- [x] `tests/unit/bases/BasesViewListSidebarService.test.ts` のフォールバック表示期待を削除
- [x] `src/i18n/resources/en.ts` / `src/i18n/resources/ja.ts` の notice 文言を更新
- [x] `AIdocs/IMPLEMENTATION.md` と `AIdocs/LOG-20260217.md` を更新

## 受け入れ条件
- 3点ボタン操作で `opened-settings` へ到達可能（実DOM: `.bases-toolbar-menu-item` + `view-config-menu` 判定）。
- 失敗時に既存コンテキストメニューは自動表示されない。
- 既存のview切替・右クリックコンテキストメニューは維持される。

## 検証メモ
- CLI実調査: `obsidian vault=vaultforplugin eval ...` でDOM確認済み（`view-config-menu` 遷移を確認）。
- `npm test -- tests/unit/integrations/bases/nativeViewSettingsBridge.test.ts tests/unit/bases/BasesViewListSidebarService.test.ts`
  は `npm: command not found` で未実行。
