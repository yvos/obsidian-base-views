# PLAN-20260219 Task List view custom 改修計画

## 1. 目的
- 既存 `tasknotesTaskList` をベースに新しい Bases カスタムビュー `Task List view custom` を追加する。
- 既存 Task List は維持し、新ビュー側で以下のみを反映する。
  - 削除: `enableSearch`（検索ボックス ON/OFF option）
  - 追加: multi-value unnest、重複行ジャンプ、2段階グループ時の視覚的インデント、2段階目グループ候補への `file.*` 7種追加

## 2. 参照した既存実装経緯（AIdocs）
- unnest + 2段階group実装:
  - `AIdocs/LOG-20260215.md` セクション 24-27
  - `AIdocs/PLAN-20260215_CustomTable2段階GroupByとUnnest実装.md`
- unnest不具合修正 + nested indent方針:
  - `AIdocs/LOG-20260215.md` セクション 29-32
- 2段階group候補への file系7種追加:
  - `AIdocs/LOG-20260218.md` セクション 16-18
  - `AIdocs/PLAN-20260218_CustomView2段階group候補file情報追加.md`
- unnest重複行ジャンプ（`git-branch`）:
  - `AIdocs/LOG-20260218.md` セクション 19-30
  - `AIdocs/PLAN-20260218_CustomTable重複行ジャンプとView一覧クリップ改善.md`
- 現在実装の全体整理:
  - `AIdocs/IMPLEMENTATION.md`
  - `AIdocs/IMPLEMENTATION-base_view_list.md`

## 3. 実装方針（高レベル）
1. **新ビューは複製ベースで追加**
- `src/bases/TaskListView.ts` を複製し `src/bases/TaskListViewCustom.ts` を新設。
- 新クラス `TaskListViewCustom` の `type` は `tasknotesTaskListCustom`。
- 既存 `tasknotesTaskList` は変更最小（互換維持）。

2. **登録を分離して段階導入**
- `src/bases/registration.ts` に `tasknotesTaskListCustom` の register/unregister を追加。
- 表示名は要件どおり `Task List view custom` とする。
- option は以下に限定:
  - `subGroup`（2段階目グループ）
  - `unnestMultiValueGroup`（default `true`）
- `enableSearch` option は追加しない（削除要件）。

3. **unnestは既存純粋関数を再利用**
- `src/bases/customTableGrouping.ts` の `extractGroupKeys()` / `groupEntriesByValue()` を `TaskListViewCustom` 側から再利用。
- 既存ログ方針どおり「元レコード複製ではなく所属展開」で処理する。

4. **重複行ジャンプは既存ユーティリティを再利用**
- `src/bases/customTableDuplicateNavigation.ts` を `TaskListViewCustom` でも利用し、`file.path -> rowOrder[]` の循環ジャンプを実装。
- 表示条件: `unnestMultiValueGroup=true` かつ同一ファイルが複数表示される場合のみ。

5. **2段階目の視認性改善（インデント）**
- 既存TaskListの sub-header だけでなく、sub-group 配下の実タスクカードにも同系統インデントclassを付与。
- 1段階目との視覚差（見出しと実タスク）を明示する。

6. **file.* 7種の候補追加（Custom view側のみ）**
- `subGroup` filter に以下を許可:
  - `file.folder`, `file.ext`, `file.size`, `file.links`, `file.backlinks`, `file.embeds`, `file.tags`
- TaskList本体で `file.*` を正しく解決できるよう、`getPropertyValue` を `propertyId直指定 + fallback` に見直し、必要に応じて `dataAdapter.getComputedProperty()` を利用。

## 4. 詳細タスク
- [x] 4.1 `TaskListViewCustom.ts` を新規作成（`TaskListView` 複製ベース）
- [x] 4.2 `TaskListViewCustom` の view option 読み込みを整理
  - `enableSearch` を読まない
  - `unnestMultiValueGroup` を追加（default true）
- [x] 4.3 サブグルーピング処理を unnest 対応へ変更
  - `groupTasksBySubProperty` を `extractGroupKeys` ベースへ置換
- [x] 4.4 `file.*` 7種の値解決ロジックを追加
  - `file.ext` / `file.folder` / `file.links` / `file.backlinks` / `file.embeds` / `file.tags` 対応
- [x] 4.5 重複行ジャンプUIを追加
  - タスクカードに `git-branch` ボタンを条件表示
  - 通常描画・仮想描画で循環ジャンプ
- [x] 4.6 ジャンプ先ハイライト（必要なら）を追加
  - 本件要件は「ジャンプ可能化」までのため、CustomTableの一時ハイライトは今回は未採用
- [x] 4.7 2段階目見出し+配下カードのインデントclassを追加
- [x] 4.8 `registration.ts` 更新
  - `buildTaskListViewCustomFactory` import
  - `tasknotesTaskListCustom` 登録
  - `subGroup` filter に file系7種許可
  - `unregisterBasesViews` に custom ID 追加
- [x] 4.9 `styles/bases-views.css` に新ビュー用スタイルを追加
- [x] 4.10 テスト追加/更新
- [x] 4.11 `AIdocs/IMPLEMENTATION.md` / `AIdocs/LOG-20260219.md` 更新

## 5. 変更対象ファイル（予定）
- 新規
  - `src/bases/TaskListViewCustom.ts`
  - `tests/unit/bases/registration.taskListCustomOptions.test.ts`（新規）
  - `tests/unit/bases/taskListCustomGrouping.test.ts`（新規）
- 更新
  - `src/bases/registration.ts`
  - `styles/bases-views.css`
  - （必要に応じて）`src/bases/TaskListView.ts`（共通化が必要な最小差分のみ）
  - `AIdocs/IMPLEMENTATION.md`
  - `AIdocs/LOG-20260219.md`

## 6. テスト計画
1. 登録オプション
- `tasknotesTaskListCustom` が登録されること
- `enableSearch` option が存在しないこと
- `unnestMultiValueGroup` option（default true）が存在すること
- `subGroup` filter で file7種が許可されること

2. グルーピング
- unnest ON: list値が複数グループへ展開されること
- unnest OFF: list値が単一結合グループになること
- 2段階目見出しと配下カードにインデントclassが付くこと

3. 重複行ジャンプ
- `unnest=true` かつ同一path複数時のみ `git-branch` ボタン表示
- クリックで次行へ循環ジャンプ
- 仮想描画ON時もジャンプ先解決できること

4. 回帰
- 既存 `tasknotesTaskList` の option/描画が変化しないこと
- 既存 `tasknotesCustomTable` の unnest/ジャンプ挙動に影響しないこと

## 7. リスクと対策
- リスク1: `file.*` 解決不足で `subGroup` が期待通り分かれない
  - 対策: `propertyId` 直指定 -> fallback -> `getComputedProperty` の順で解決し、テストで7種を固定検証
- リスク2: 仮想描画時のジャンプ先解決ずれ
  - 対策: `rowOrder -> virtualIndex` の明示マップを導入し、renderごとに再構築
- リスク3: 複製起点による将来の差分ドリフト
  - 対策: まずは要件達成優先で複製し、次段で共通ロジックを util 抽出する前提をログに残す

## 8. 受け入れ条件
- Bases のビュー選択に `Task List view custom` が追加される。
- 新ビューでは検索ボックスON/OFF option が存在しない。
- 新ビューで `unnestMultiValueGroup` が有効に機能する。
- 新ビューで重複行ジャンプ（`git-branch`）が機能する。
- 新ビューで2段階目見出しと実タスクがインデントされる。
- 新ビューの `subGroup` 候補に file7種が含まれる。
- 既存 `tasknotesTaskList` / `tasknotesCustomTable` の既存挙動が維持される。
