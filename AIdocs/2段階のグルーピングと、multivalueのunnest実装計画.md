# 2段階のグルーピングと、multivalueのunnest実装計画

## 1. 目的
- 対象: `tasknotesCustomTable`（Custom Table View）
- 追加機能:
  - 2段階 Group by（Bases の1段階 groupBy に加えて、view option の `Sub-group by` でネスト）
  - Group by 対象が multi-value（list）プロパティのときの unnest（1レコードを複数グループへ表示）
- 要件:
  - unnest は設定で ON/OFF 可能
  - デフォルトは ON
  - 2段階 Group by と unnest は共存可能
  - 既存の仮想スクロール・summary・列リサイズを壊さない

## 2. 調査サマリ
### 2.1 Obsidian CLI 調査（read-only）
- 実行確認:
  - `obsidian help` は実行可能（権限付き実行）
- `base:views` で現在の `.base` の view type 一覧を確認できることを確認。
- `eval` で `controller.query.views` を確認し、各 view が `name/type/data/...` を持つことを確認。
- 注意:
  - `groupBy` は public API から直接取りにくく、既存コードでも internal 構造参照が使われている。

### 2.2 既存コード（TaskNotes Task List）解析
- `src/bases/registration.ts`
  - `tasknotesTaskList` は view option として `subGroup`（property）を提供済み。
- `src/bases/TaskListView.ts`
  - `config.getAsPropertyId("subGroup")` で2段目グループプロパティを取得。
  - 1段目は Bases の `groupedData` を利用。
  - 2段目は `groupTasksBySubProperty()` で view 内で再グルーピング。
  - groupBy 未設定時（`isGrouped() === false`）かつ `subGroup` がある場合は、`subGroup` を実質 primary group として扱う。
  - `buildPathToPropsMap()` で path -> properties を作り、サブグループ計算を高速化。
- 重要な観察:
  - `groupTasksBySubProperty()` は配列値を `", "` で連結し、unnest は未対応。
  - primary group 検出は `isGrouped()` ベースで、`groupBy設定済みだが全件null` との厳密区別は弱い。

## 3. 2段階グルーピング: 一般的な実装方針（プロ視点）
## 3.1 基本設計
- 表示用の「仮想グループ所属（membership）」を作る。
- 元レコード（Bases entry）は複製せず、参照だけを複数グループにぶら下げる。
- データモデル（案）:
  - `EntryRef`（元レコード参照: path + entry）
  - `GroupMembership`（`primaryKey`, `secondaryKey`, `entryRef`）
  - `NestedGroups`（`Map<primaryKey, Map<secondaryKey, EntryRef[]>>`）

## 3.2 処理パイプライン
1. Bases が返した filtered/sorted 済みデータを受け取る。
2. primary group を決定:
   - Bases groupBy が有効なら groupedData を土台にする。
   - 無効なら擬似 primary（`"All"` 等）1グループ。
3. secondary group（`subGroup`）が設定されていれば、各 primary 内で再グルーピング。
4. 描画用に flatten:
   - `primary-header -> secondary-header -> row`
   - 必要に応じて summary row
5. 行描画は既存セルレンダラを再利用。

## 3.3 性能方針
- `path -> entry/task` Map を先に構築し、`filter` の多重走査を避ける。
- グループキー計算はキャッシュ（`entryPath + propertyId -> keys[]`）。
- 仮想スクロールの入力は flatten 後 item 配列のみ。
- 元データコピーを避け、`EntryRef` 参照のみ保持。

## 4. multi-value unnest: 一般的な実装方針（プロ視点）
## 4.1 期待挙動
- 例: groupBy プロパティ値が `[A, B]`
  - unnest ON: A グループと B グループの両方に表示
  - unnest OFF: 従来どおり `A, B`（または値オブジェクトの文字列表現）で1グループ

## 4.2 キー抽出関数
- `extractGroupKeys(value, { unnest }) -> string[]`
  - null/empty -> `["None"]`
  - scalar -> `[toKey(value)]`
  - list:
    - unnest ON -> `["A", "B", ...]`（重複除去）
    - unnest OFF -> `["A, B, ..."]`

## 4.3 2段階との共存時
- primary も secondary も list で unnest ON の場合:
  - 組合せ（直積）で所属を作る（`A/X, A/Y, B/X, B/Y`）
- ただし性能保護として、1レコード当たりの所属数に安全上限（例: 64）を設け、超過時はログ警告＋切り詰めを検討。

## 5. Bases仕様を踏まえた実装方針
## 5.1 なぜ「仮想レコード」が必要か
- Bases は filter で対象ファイル集合を高速に確定する。
- 複数グループ表示は Bases 側ではなく custom view 側表示ロジックで実現する必要がある。
- したがって、ファイル自体は1件のまま、表示上だけ複数 membership を持たせる。

## 5.2 primary group の取り扱い
- 既存方針を踏襲し、primary はまず `data.groupedData` を優先利用。
- ただし unnest ON 時に primary が list のときは、Bases の groupedData だけだと「結合キー」になってしまうため、view 側で再展開が必要。
- このとき groupBy property ID 取得が必要:
  - 候補: 既存 Kanban と同様に `controller.query.views + viewName`（internal）から取得
  - 代替（public APIのみ）では厳密対応が難しい
- 結論:
  - **internal API 参照を計画に含める**（既存コードにも先例あり）

## 5.3 unnest 設定
- Custom Table の view option に追加:
  - `type: "toggle"`
  - `key: "unnestMultiValueGroup"`
  - `displayName: "Unnest multi-value groups"`
  - `default: true`
- この1トグルを primary/secondary の両方に適用。

## 6. 「自前設計」vs「TaskNotes Task List実装方式」の比較
### 6.1 TaskList方式の利点
- 既存コードとの整合性が高い（`subGroup` option、path->props、段階グルーピング）。
- 導入リスクが低い。

### 6.2 TaskList方式の課題
- multi-value unnest 未対応。
- primary group 判定の厳密性に弱点（`isGrouped()` の限界）。
- `groupPaths + filter` 型の走査は件数増でコスト増。

### 6.3 自前（汎用）設計の利点
- unnest/2段階/仮想化を最初から同じデータモデルで扱える。
- 表示 item の生成を純粋関数化しやすく、テストしやすい。

### 6.4 推奨
- **推奨はハイブリッド**:
  - 基本方針は TaskList の実装思想（Bases primary + view内 secondary）を継承
  - 実装は Custom Table 向けに「grouping engine（純粋関数）」として新規抽出し、unnest を同時に内包
- 理由:
  - 既存資産の再利用性と、今回要件（unnest + 共存 + 高速）を同時に満たしやすい。

## 7. 実装順序（どちらを先に実装すべきか）
- 先行実装: **multi-value unnest対応を含む grouping engine の導入**
- 後続実装: 2段階表示（secondary headers, nested virtual items）
- 理由:
  - 2段階化だけ先に実装すると、unnest追加時に grouping 部分を再設計し直す可能性が高い。
  - 先に membership 生成基盤を固める方が差分が局所化し、回帰を抑えやすい。

## 8. 推奨実装計画（詳細タスク）
## Phase 0: 設計固定
1. `CustomTableView` のグルーピング責務を純粋関数へ切り出す方針を確定。
2. internal API 利用箇所を明示:
   - `controller.query.views`
   - `controller.viewName`
3. summary の仕様を固定:
   - secondary 単位で表示（primary-only時は現行互換）

## Phase 1: オプション追加
1. `src/bases/registration.ts`
   - `tasknotesCustomTable` options に以下を追加:
     - `subGroup`（property）
     - `unnestMultiValueGroup`（toggle, default true）
2. `src/bases/CustomTableView.ts`
   - view option 読み込み処理を追加（`readViewOptions`）。

## Phase 2: グルーピング基盤（unnest先行）
1. 新規: `src/bases/customTableGrouping.ts`（想定）
   - `extractGroupKeys(value, unnest)`
   - `buildPrimaryGroups(...)`
   - `buildNestedGroups(...)`
   - `flattenNestedGroupsForVirtual(...)`
2. 値正規化:
   - Bases `Value` / Array / scalar の共通処理。
3. 参照型 membership 生成:
   - 元 entry の重複コピーを避ける。

## Phase 3: CustomTableView 統合
1. grouped 判定ルートを書き換え:
   - 既存 `extractRenderableGroups()` 依存から、新 grouping engine ベースへ移行。
2. 通常描画:
   - primary見出し + secondary見出し + table rows
3. 仮想描画:
   - 既存 `VirtualGroupedItem` 拡張
   - item type 追加（`primary-header`, `secondary-header`, `row`, `summary`）
4. summary 行:
   - secondary単位（必要に応じて primary合計も将来拡張可能な構造）

## Phase 4: UI/CSS
1. `styles/bases-views.css`
   - secondary header 用スタイル追加
   - nested時の余白・境界線・sticky挙動を調整
2. 既存 row height / resize handle / hover の互換性確認。

## Phase 5: テスト
1. 新規ユニットテスト:
   - `tests/unit/bases/customTableGrouping.test.ts`（想定）
   - ケース:
     - primaryのみ
     - secondaryのみ
     - primary+secondary
     - unnest ON/OFF
     - `[A,B]` と `[B,A]` の扱い
     - null/empty/list重複
2. 既存テスト更新:
   - `customTableVirtualization.test.ts`（flatten item type拡張対応）
3. 回帰観点:
   - 大量件数で仮想スクロール有効
   - summary/列幅リサイズが維持

## Phase 6: ドキュメント更新
1. `AIdocs/LOG-YYYYMMDD.md`
2. `AIdocs/IMPLEMENTATION.md`
3. 必要なら `AIdocs/Table view.md`

## 9. リスクと対策
- リスク: list x list の直積で item 数が急増
  - 対策: membership 上限、キャッシュ、仮想スクロールの閾値調整
- リスク: groupBy property 特定が internal API 依存
  - 対策: 取得失敗時は現行 groupedData フォールバック（unnest無効相当）
- リスク: summary 値が「表示件数ベース」になり重複が増える
  - 対策: 仕様として明記（表示上の所属に基づく集計）

## 10. 受け入れ条件
- 2段階 Group by が Custom Table で動作する。
- unnest ON で list 値が個別グループに展開される（デフォルト ON）。
- unnest OFF で従来互換の結合キー挙動に戻せる。
- 2段階 Group by と unnest を同時に有効化しても破綻しない。
- 既存機能（仮想スクロール、summary、列リサイズ、検索/フィルタ反映）に回帰がない。
