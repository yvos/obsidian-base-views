# PLAN-20260219 CustomViewグルーピング不具合修正

## 1. 目的
- `tasknotesCustomTable` で報告された以下2件を修正する。
  - 1段階グルーピング時だけ表示が old style に切り替わる不整合。
  - グルーピング解除（groupBy削除）時に表示が更新されない、または `No rows match the current filters.` になる不具合。

## 2. 原因仮説
1. 表示不整合
- grouped描画で `virtual` / `normal` の2経路があり、閾値条件で `normal` に入ると「グループごとに別テーブル + ヘッダ繰り返し」になる。

2. 解除失敗/No rows
- `groupBy` 判定に `controller.query.views` を使う経路があり、更新タイミング次第で stale な groupBy を拾って再グループ化してしまう。
- 非グループ描画時の `entries` 抽出が `groupedData[0]?.entries || allEntries` で、先頭が空配列だと `allEntries` へフォールバックせず0件扱いになる。

## 3. 対応方針
1. grouped表示の見た目統一
- grouped時は件数閾値に関係なく virtual描画を使い、ヘッダ1回表示のレイアウトへ統一する。

2. groupBy判定の安定化
- `groupBy` 取得は `config` を優先し、`config` で「未設定」と判定できた場合は `controller.query.views` へフォールバックしない。
- `controller.query.views` は `config` から判定できない場合のみ補助的に使う。

3. 非グループ時のエントリ抽出修正
- 非グループ描画では `allEntries` を優先し、先頭group空配列による誤0件を防ぐ。

## 4. 変更対象
- `src/bases/CustomTableView.ts`
- `AIdocs/LOG-20260219.md`

## 5. タスク
- [x] grouped描画ルートを統一（常時virtual）
- [x] groupBy取得ロジックを `config` 優先へ修正
- [x] 非グループ時の `entries` 抽出を修正
- [x] 影響範囲を確認し、`AIdocs/LOG-20260219.md` に記録

## 6. フォローアップ（同日追加）
- [x] 1段階目グルーピングの unnest 回帰を修正
  - `config.getAsPropertyId("groupBy")` が `null` の場合でも `config.get("groupBy")` の object 形式から property を解決する。
  - grouped時のみ controller fallback を許可する既存方針を維持し、解除時の安定化を壊さない。
