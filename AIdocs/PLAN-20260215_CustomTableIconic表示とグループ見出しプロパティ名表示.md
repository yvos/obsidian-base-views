# PLAN-20260215 CustomTableIconic表示とグループ見出しプロパティ名表示

## 目的
- `tasknotesCustomTable` の `name` 列（`file.name`）左に、Iconicプラグイン由来のファイルアイコンを表示する。
- グルーピング時の見出しに、グループキーだけでなく `property: value` 形式のラベルを表示可能にする。

## 方針
- どちらもプラグイン設定でON/OFF可能にする。
  - Iconicアイコン表示: デフォルトON
  - グループ見出しのプロパティ名表示: デフォルトOFF
- Iconic連携は非公開API前提のため、防御的に実装する。
  - `app.plugins.getPlugin("iconic")` が存在する場合のみ使用
  - 取得失敗時は従来表示へフォールバック
- 既存の2段階グルーピング/仮想スクロール/summary/列幅リサイズを維持する。

## 実装タスク
- [completed] `src/types/settings.ts` に新規設定キーを追加
- [completed] `src/settings/defaults.ts` にデフォルト値を追加
- [completed] `src/settings/tabs/generalTab.ts` に設定UIトグルを追加
- [completed] `src/bases/CustomTableView.ts` にIconicアイコン描画を追加
- [completed] `src/bases/CustomTableView.ts` にグループ見出しの `property: value` 表示を追加
- [completed] `styles/bases-views.css` にname列アイコン表示スタイルを追加
- [completed] テスト追加/更新
- [completed] `AIdocs/LOG-20260215.md` / `AIdocs/IMPLEMENTATION.md` を更新

## 受け入れ条件
- `file.name` 列でIconicアイコンが表示される（設定ON時）
- Iconic未導入/情報未取得時でもエラーなく表示継続する
- グループ見出しで `property: value` を表示できる（設定ON時）
- 設定OFF時は従来表示に戻る
- 既存機能（仮想化/summary/列リサイズ）に回帰がない
