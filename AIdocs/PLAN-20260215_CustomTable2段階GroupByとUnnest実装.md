# PLAN-20260215 CustomTable2段階GroupByとUnnest実装

## 目的
- `tasknotesCustomTable` に以下を実装する。
  - 2段階 Group by（Basesのprimary group + view option の sub-group）
  - multi-value group の unnest（デフォルトON、設定でOFF可能）

## 実装方針
- TaskListView の既存設計（Bases primary + view内再グルーピング）を踏襲しつつ、
  CustomTable向けにグルーピング基盤を切り出す。
- 元レコードは複製せず、表示上の複数所属（仮想membership）として展開する。
- 既存の仮想スクロール・summary・列リサイズを維持する。

## タスク
- [completed] `src/bases/registration.ts` に `subGroup` / `unnestMultiValueGroup` option を追加
- [completed] `src/bases/customTableGrouping.ts` を新規追加（group key抽出/unnest/グループ化）
- [completed] `src/bases/CustomTableView.ts` にネストグルーピング描画（通常/仮想）を統合
- [completed] `styles/bases-views.css` に nested group 見出しスタイルを追加
- [completed] `tests/unit/bases/customTableGrouping.test.ts` を追加
- [completed] 影響箇所レビューとドキュメント更新

## 受け入れ条件
- primary + sub-group の2段階表示が可能
- list値の group は unnest ON で複数グループ所属、OFFで従来互換
- 既存の summary / virtualization / column resize が動作継続
