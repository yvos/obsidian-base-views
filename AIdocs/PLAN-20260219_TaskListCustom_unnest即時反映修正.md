# PLAN-20260219 Task List custom unnest・即時反映修正

## 1. 目的
- `Task List view custom` で `unnestMultiValueGroup` が期待どおり効かない問題を解消する。
- 2段階グルーピング設定変更（`subGroup` / `unnestMultiValueGroup`）を、`tasknotesCustomTable` と同様に明示的なview切替なしで即時反映させる。

## 2. 原因仮説（CustomTableとの比較）
- `CustomTableView` は `render()` のたびに `readViewOptions()` を再実行し、`onDataUpdated()` で設定差分検知時は即時レンダリングする。
- `TaskListViewCustom` は `readViewOptions()` を初回のみ実行するため、設定変更後も古い `subGroup/unnest` 値を保持し続ける。
- `unnestMultiValueGroup` の読み取りが `as boolean` 依存のため、文字列値（`"false"` 等）が来た場合に意図しない挙動になる可能性がある。

## 3. 対応方針
1. `TaskListViewCustom` の option 読み取りを堅牢化
- `subGroup` を trim して空文字は `null` 扱い
- `unnestMultiValueGroup` を boolean正規化（`true/false` 文字列含む）

2. `TaskListViewCustom` の再描画フロー改善
- `render()` ごとに `readViewOptions()` を実行して設定変更を反映
- `onDataUpdated()` を override し、設定シグネチャ差分時は即時描画・通常更新のみ短デバウンス

3. 回帰防止テスト
- `readViewOptions()` の boolean正規化テスト追加
- `onDataUpdated()` の「設定変更時は即時」「通常更新はデバウンス」テスト追加

## 4. 変更対象
- `src/bases/TaskListViewCustom.ts`
- `tests/unit/bases/taskListCustomGrouping.test.ts`
- `AIdocs/LOG-20260219.md`

## 5. 受け入れ条件
- `unnestMultiValueGroup` 変更が `Task List view custom` に即時反映される。
- `subGroup` 変更が view再切替なしで反映される。
- CustomTableとの差分原因が説明可能な状態で、ユニットテストに反映される。

## 6. 実施結果
- [x] 原因分析（CustomTableとの差分）を整理。
- [x] `TaskListViewCustom` の option 読み取りを毎render反映へ変更。
- [x] `TaskListViewCustom` に config差分検知付き `onDataUpdated()` を追加。
- [x] `unnestMultiValueGroup` の bool正規化（文字列 `\"true\"/\"false\"` 対応）を追加。
- [x] 1段階目グルーピング（primary groupBy）の unnest 展開を追加。
- [x] 回帰防止テストを `tests/unit/bases/taskListCustomGrouping.test.ts` に追加。
