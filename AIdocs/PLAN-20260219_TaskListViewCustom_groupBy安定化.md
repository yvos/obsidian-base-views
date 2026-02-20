# PLAN-20260219 TaskListViewCustom groupBy安定化

## 1. 目的
- `tasknotesTaskListCustom` に、`CustomTable` と同種の groupBy 参照不安定（解除時stale参照 / unnest判定失敗）が潜在しないよう、groupBy解決を安定化する。

## 2. 対応方針
1. groupBy解決を `config` 優先へ変更
- `config.getAsPropertyId("groupBy")` / `config.get("groupBy")` を優先して property/direction を解決する。

2. fallback条件を grouped時のみに制限
- grouped時のみ `controller.query.views` を補助参照し、flat時は stale groupBy を拾わない。

3. 1段階目 unnest への影響を担保
- `groupBy` が object 形式でも primary property を取りこぼさないようにし、unnest再構成の判定を維持する。

4. テスト追加
- config object由来の groupBy 解決と、flat時fallback抑止の回帰テストを追加する。

## 3. 変更対象
- `src/bases/TaskListViewCustom.ts`
- `tests/unit/bases/taskListCustomGrouping.test.ts`
- `AIdocs/LOG-20260219.md`

## 4. タスク
- [x] TaskListViewCustom の groupBy解決ロジック修正
- [x] buildViewConfigSignature / unnest判定側の呼び出し修正
- [x] 回帰テスト追加
- [x] LOG記録
