# PLAN-20260209 CustomTableView

## 目的
Obsidian Bases の Table view を参考に、TaskNotes に `tasknotesCustomTable` を MVP 範囲で追加する。

## スコープ
- 表示中心（編集系・複数セル選択・コピー/貼り付け・Undo/Redo は対象外）
- Base フィルタ結果の全エントリを表示
- 組み込み summary のみ
- 既存テンプレート生成・Saved View 変換ロジックは変更しない

## 実装タスク
- [x] `src/bases/CustomTableView.ts` を新規追加
  - [x] `BasesViewBase` 継承 / `type = "tasknotesCustomTable"`
  - [x] grouped/ungrouped 両対応のテーブル描画
  - [x] `file.name` 列のリンク描画
  - [x] `Value.renderTo(...)` 優先表示 + fallback
  - [x] `rowHeight` オプション反映
  - [x] ヘッダー右クリックで summary 設定
  - [x] `tableSummaries` の config 永続化
- [x] `src/bases/tableSummary.ts` を新規追加
  - [x] empty/filled/unique
  - [x] sum/avg/min/max
  - [x] earliest/latest/range
  - [x] checked/unchecked
- [x] `src/bases/registration.ts` 更新
  - [x] view 登録追加
  - [x] unregister 追加
  - [x] 登録成功判定へ追加
- [x] `styles/bases-views.css` 更新
  - [x] table 用スコープスタイル追加
  - [x] 4段階 row height 対応
  - [x] モバイル横スクロール対応
- [x] テスト追加
  - [x] `tests/unit/bases/tableSummary.test.ts`
- [ ] 検証
  - [ ] `npm run typecheck`（実行不可: Node/npm が環境に存在しない）
  - [ ] `npm run build`（実行不可: Node/npm が環境に存在しない）
- [x] ドキュメント更新
  - [x] `AIdocs/LOG-20260209.md`
  - [x] `AIdocs/IMPLEMENTATION.md`

## 受け入れ条件
- Bases の view selector から `TaskNotes Table` を選べる
- `order` に従って列表示される
- grouped/ungrouped の両方で表示できる
- rowHeight が short/medium/tall/extraTall で反映される
- summary 設定済みの列だけ summary bar が表示される
- grouped 時にグループ先頭で summary が表示される
