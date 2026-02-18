# Bases view一覧自動更新 + Custom Table見た目合わせ + 3点リーダUI調整

## 概要
1. view一覧は手動更新依存をやめ、`.base` ファイル変更時に自動再描画する。
2. Custom Table の文字サイズをネイティブTable寄りに再調整し、`Row height = Very short` を追加する。
3. view一覧の3点リーダは「名前ボタン枠内右端」に配置し、3点ボタン自体の枠線/背景を出さない見た目に統一する。

## 実装方針（確定）
1. 自動更新方式は「対象 `.base` のみ追跡 + 600msデバウンス + 該当leafのみ再描画」。
2. `Very short` は固定 `22px`。
3. 3点リーダのホバー表現は「アイコンのみ強調（枠線なし・背景なし）」。

## タスク
1. [x] `src/bases/BasesViewListSidebarService.ts` に `.base` 変更監視（modify/rename/delete）を追加。
2. [x] `.base` 変更時に `yamlStore.clearCache(file.path)` 実行後、600msデバウンスで該当leafのみ `refreshLeaf`。
3. [x] `rename/delete` で oldPath も追跡し、必要時のみ `scheduleRefresh(120)` を補助実行。
4. [x] `src/bases/registration.ts` の `rowHeight` dropdown に `veryShort` を追加。
5. [x] `src/bases/CustomTableView.ts` の `RowHeightOption` / `VALID_ROW_HEIGHTS` に `veryShort` を追加。
6. [x] `styles/bases-views.css` に `veryShort` 行高クラスを追加（22px）。
7. [x] `styles/bases-views.css` の Custom Table タイポグラフィを `font-ui-small/smaller` ベースへ調整。
8. [x] `styles/bases-views.css` の3点リーダ配置・見た目を修正（枠線/背景なし、右端内側絶対配置）。
9. [x] `estimateItemWidthPx()` の action slot 見積もりを必要に応じて調整。
10. [x] `tests/unit/bases/BasesViewListSidebarService.test.ts` を更新（自動更新監視・デバウンス・非.base無視）。
11. [x] `tests/unit/bases/registration.customTableOptions.test.ts` を新規追加（veryShort option）。
12. [x] `AIdocs/IMPLEMENTATION.md` と `AIdocs/LOG-20260218.md` を更新。
