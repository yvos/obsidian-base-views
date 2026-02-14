# PLAN-20260214 Basesビュー一覧改善

## 目的
- Bases view一覧のUI/操作性を強化し、将来の独立プラグイン化に向けて実装境界を明確化する。

## 実装タスク
- [x] `view <= 1` で一覧UI/トグルを完全非表示にする
- [x] view type対応アイコン表示（registrations優先、未知は`list`）
- [x] 開閉UI追加（一覧ヘッダーの`x`、toolbar左端の`list-plus`）
- [x] 一覧幅のドラッグリサイズ（右端ハンドル）
- [x] 開閉状態・幅のグローバル永続化設定追加
- [x] サービス再整理（設定I/O、i18n、icon解決の境界整理）
- [x] i18nキー追加（en/ja）
- [x] CSS拡張（header/icon/resizer/open-trigger）
- [x] 単体テスト拡張
- [x] `AIdocs/IMPLEMENTATION-base_view_list.md` 新規作成
- [x] `AIdocs/IMPLEMENTATION.md` へ参照追記
- [x] `AIdocs/LOG-20260214.md` 追記

## 受け入れ条件
- viewが1件のみのbaseでは一覧・トグルが表示されない
- 複数viewのbaseでは行頭にtype対応アイコンが表示される
- `x`で閉じ、`list-plus`で再表示できる
- 幅をドラッグ変更でき、再表示後も保存値が反映される
- refresh連打やleaf変更後もlayout/toggler/resizerが増殖しない

## 検証制約
- 現環境は `npm` 未導入のため、unit test / typecheck / build は未実行（テスト追加のみ）。
