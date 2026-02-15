# PLAN-20260215 CustomViewアイコン改善

## 目的
- `tasknotesCustomTable`（custom view）のviewアイコンを `table-cells-merge` に変更する。
- CustomTableのヘッダー各プロパティ先頭に、可能な範囲でプロパティ種別アイコンを表示する。

## 方針
- viewアイコン:
  - Bases登録時の `icon` を `table-cells-merge` へ変更。
  - view一覧サイドバーの既知アイコンfallbackも同値へ揃える。
- プロパティアイコン:
  - Bases/metadata 側から直接取得できるアイコン情報があれば利用。
  - 取得できない場合は `propertyId` の規則（`file.*`, `note.*`, `formula.*`, 名前パターン）でフォールバック。
  - ヘッダー（通常テーブル/仮想テーブル）両方に反映。

## 実装タスク
- [completed] `src/bases/registration.ts` の custom table icon を変更
- [completed] `src/bases/BasesViewListSidebarService.ts` の既知アイコンfallbackを変更
- [completed] `src/bases/CustomTableView.ts` にプロパティヘッダーアイコン描画を追加
- [completed] `styles/bases-views.css` にヘッダーアイコン表示スタイルを追加
- [completed] 関連テストを更新（view一覧アイコン期待値、必要なら追加テスト）
- [completed] `AIdocs/LOG-20260215.md` / `AIdocs/IMPLEMENTATION*.md` を更新

## 受け入れ条件
- custom viewのアイコンが `table-cells-merge` で表示される
- CustomTableヘッダーの各列で、ラベル先頭にアイコンが表示される
- 既存機能（列リサイズ、summaryメニュー、仮想スクロール）に回帰がない
