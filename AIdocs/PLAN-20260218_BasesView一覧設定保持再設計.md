# Bases view一覧 設定保持の再設計計画（グローバル依存解消 + base単位永続化）

## 1. 概要
目的は、view一覧表示設定の「グローバル一括反映」を解消し、`base` 単位の永続設定 + `leaf` 単位の一時設定へ再編することです。  
今回の方針は次のとおり確定します。

- 狭幅対応設定（`narrowBehavior` / `narrowThreshold`）は現行どおり残す。
- `position = none` で開いた後に close したら、`none`（非表示）へ戻す。
- サイドペイン時のデフォルト配置は `top`。
- `formulas` の真偽値は **YAML string (`"true"` / `"false"`)** で保存する。

## 2. 変更対象（高レベル）
1. 設定モデルを再編（グローバル値は「デフォルト値」に限定）
2. `.base` `formulas` に base単位オーバーライドを保存
3. `leaf` 単位の一時状態（temporary）を導入
4. view一覧コンテキストメニューを「一時変更」と「base永続変更」に分離
5. 表示解決ロジックを「temporary > base formulas > plugin default」に統一
6. テストを `YamlStore` / `SidebarService` / 設定UI の3境界で拡張
7. ドキュメント更新

## 3. 公開API/型/設定の変更
### 3.1 `TaskNotesSettings`（`src/types/settings.ts`）
- 追加:
  - `basesViewListSidePanePlacement: "left" | "top" | "none"`（新規、デフォルト `top`）
- 変更:
  - `basesViewListPlacement` を `"left" | "top"` → `"left" | "top" | "none"` に拡張
- 維持:
  - `enableBasesViewListSidebar`（機能ON/OFF）をそのまま利用
  - `basesViewListShowProperty` / `basesViewListPropertyKey` / `basesViewListTopOverflowMode` は「デフォルト値」として利用
- 非推奨化（内部的に使用停止）:
  - `basesViewListCollapsed`（グローバル開閉状態）
    - データ互換のため読み込みは許容、ロジック上は使わない

### 3.2 デフォルト値（`src/settings/defaults.ts`）
- `basesViewListPlacement: "left"`（none選択可能化）
- `basesViewListSidePanePlacement: "top"`（新規）

### 3.3 設定ロードマイグレーション（`src/main.ts`）
- `hasNewBasesSidebarSettings` に `basesViewListSidePanePlacement` を追加
- `basesViewListPlacement` の `none` 許容を反映
- `basesViewListCollapsed` は存在しても挙動に使わない（保存互換のみ）

## 4. `.base formulas` 永続化仕様
`src/bases/BaseViewListYamlStore.ts` を拡張し、以下のキーを扱う。  
（キー名は衝突回避のため `tn` 接頭辞を付与）

- `tnViewListPosition`: `"left" | "top" | "none"`（通常ペイン）
- `tnViewListSidePanePosition`: `"left" | "top" | "none"`（サイドペイン）
- `tnViewListShowProperty`: `"true" | "false"`（文字列）
- `tnViewListPropertyKey`: `string`
- `tnViewListTopOverflowMode`: `"wrap" | "scroll"`
- 既存維持: `viewListSize`（幅比率、文字列）

追加メソッド（例）:
- `getViewListFormulaPrefs(file): Promise<BaseViewListFormulaPrefs>`
- `setViewListPosition(file, context, value|null)`
- `setViewListShowProperty(file, value|null)`
- `setViewListPropertyKey(file, value|null)`
- `setViewListTopOverflowMode(file, value|null)`

`null` 保存時は該当キー削除、`formulas` が空なら `formulas` 自体削除。

## 5. 表示解決ロジック（場合分けの中核）
`src/bases/BasesViewListSidebarService.ts` で以下順序で解決する。

### 5.1 参照コンテキスト判定
- `isSidePaneLeaf(leaf)` を追加
  - `containerEl.closest(".workspace-split.mod-left-split, .workspace-split.mod-right-split")` で判定
  - 判定不能時は `false`（通常ペイン）扱い

### 5.2 有効設定の優先順位
- `temporary(leaf)` > `base formulas(.base)` > `plugin defaults`

対象項目:
- 配置（normal/sideそれぞれ）
- showProperty
- propertyKey
- topOverflowMode
- width（既存 `viewListSize` + default + auto-shrink）

### 5.3 配置の最終決定（詳細分岐）
1. コンテキスト別デフォルト配置を取得  
   - 通常: `basesViewListPlacement`
   - サイド: `basesViewListSidePanePlacement`
2. base永続オーバーライドがあれば置換
3. temporary placement（left/top）があれば最優先適用
4. 結果が `none` かつ temporaryなしなら「非表示」
5. 狭幅ルール適用  
   - `narrowBehavior=hide` なら一時非表示
   - `narrowBehavior=top` なら top 強制 + overflow は強制 scroll
6. 表示/非表示に応じて view list 本体 or toolbarトリガアイコンを描画

### 5.4 `none` + close/open の挙動
- `none` 初期状態: 非表示 + toolbarアイコン表示
- toolbarアイコンクリック:
  - 通常ペインなら temporary placement = `left`
  - サイドペインなら temporary placement = `top`
- closeクリック:
  - temporary placement をクリアせず `none` に設定し、再び `none` 状態へ戻す

### 5.5 「左に表示/上に表示」の扱い
- 既存メニュー項目は **一時変更専用** に変更
- plugin設定・formulaは書き換えない
- 対象leafにだけ反映

## 6. コンテキストメニュー仕様（再設計）
### 6.1 既存項目（意味変更）
- `左に表示` / `上に表示`:
  - そのleaf限定の temporary 変更

### 6.2 新規永続項目（base formula保存）
表示文言はサイドペイン中なら「サイドペインで」を差し込む。

- 項目A（動的）:
  - 現在表示がleftなら: `このbaseは(サイドペインで)view一覧を常に左に表示する`
  - 現在表示がtopなら: `このbaseは(サイドペインで)view一覧を常に上に表示する`
  - クリックで該当 `tnViewListPosition*` をトグル保存
  - 既に同値が保存済みならチェック表示 + クリックで削除（デフォルトに戻す）

- 項目B:
  - `このbaseは(サイドペインで)view一覧を表示しない`
  - `none` をトグル保存
  - 保存済みならチェック表示 + 再クリックで削除

### 6.3 プロパティ表示ON/OFF
- メニューで切替時は plugin設定を書き換えず、`tnViewListShowProperty` を保存

### 6.4 表示プロパティ変更
- 新規メニュー: `表示プロパティを変更`
- 入力モーダルでキー入力
- 入力キーが存在すれば `tnViewListPropertyKey` 保存
- 存在しなければ `tnViewListPropertyKey` 削除（デフォルトへ復帰）

### 6.5 上端オーバーフロー
- top表示時のみメニュー表示
- wrap/scroll を `tnViewListTopOverflowMode` に保存
- ただし狭幅で auto-top 強制中は表示結果は常に scroll（設定値は保持）

## 7. 設定画面（General Tab）再構成
`src/settings/tabs/generalTab.ts`

1. `enableBasesViewListSidebar` は維持（機能全体ON/OFF）
2. `placement` dropdown に `none` を追加
3. 新規 `sidePanePlacement` dropdown（left/top/none）
4. `property.key` の名称変更:
   - `表示するプロパティ名のデフォルト値`
   - 説明文に「右クリックでbaseごと変更可能」を明記
5. `narrowBehavior` / `narrowThreshold` は維持

## 8. i18n更新
`src/i18n/resources/ja.ts` / `src/i18n/resources/en.ts` に追加・更新。

- 設定UI:
  - placement `none`
  - sidepane placement 名称/説明/選択肢
  - property key 名称/説明の更新
- context menu:
  - temporary placement 用
  - 永続配置保存用（left/top動的文言、none文言、sidepane差し込み）
  - property key 変更メニュー
  - overflow wrap/scroll 保存メニュー

## 9. テスト計画（決定済み）
### 9.1 `tests/unit/bases/BaseViewListYamlStore.test.ts`
- 新規キーの read/write/toggle/delete
- boolean保存の読込（`true/false`）
- enum不正値の無視（fallback）
- formulas空時の削除

### 9.2 `tests/unit/bases/BasesViewListSidebarService.test.ts`
- `none` 初期非表示 + trigger表示
- `none` から open:
  - 通常ペイン→left
  - サイドペイン→top
- close後に `none` 復帰
- temporary left/top が leaf限定で効き、永続化しない
- 永続メニューで formula 保存/削除（チェック状態含む）
- showProperty toggle が formula保存になる（plugin設定不変）
- property key変更:
  - 既存キーで保存
  - 非存在キーで削除/fallback
- top overflow 保存 + 狭幅auto-top時scroll強制
- 複数base・複数leafで設定が独立する

### 9.3 設定UIテスト（必要時）
- placement `none` 表示
- sidepane placement 設定表示
- property key 名称/説明更新

## 10. 実装順序（推奨）
1. `BaseViewListYamlStore` 拡張（読み書きAPI）
2. `settings` 型/デフォルト/ロードマイグレーション更新
3. `SidebarService` の設定解決ロジックと temporary state 導入
4. コンテキストメニュー差し替え
5. General Tab と i18n 更新
6. 単体テスト更新
7. ドキュメント更新

## 11. 変更対象ファイル
- `src/bases/BasesViewListSidebarService.ts`
- `src/bases/BaseViewListYamlStore.ts`
- `src/settings/tabs/generalTab.ts`
- `src/settings/defaults.ts`
- `src/types/settings.ts`
- `src/main.ts`
- `src/i18n/resources/ja.ts`
- `src/i18n/resources/en.ts`
- `tests/unit/bases/BaseViewListYamlStore.test.ts`
- `tests/unit/bases/BasesViewListSidebarService.test.ts`
- `AIdocs/PLAN-20260218_BasesView一覧設定保持再設計.md`（新規）
- `AIdocs/LOG-20260218.md`（更新）
- `AIdocs/IMPLEMENTATION.md`（更新）
- `AIdocs/IMPLEMENTATION-base_view_list.md`（更新）

## 12. 明示的な前提・デフォルト
1. 狭幅設定（`narrowBehavior` / `narrowThreshold`）は現行仕様を維持する。  
2. `position=none` で開いた後に close すると `none` に戻す。  
3. サイドペイン時のデフォルト配置は `top`。  
4. `.base formulas` の真偽値は YAML string (`"true"` / `"false"`) を使用する。  
5. サイドペイン判定はDOMクラスベース（`mod-left-split/mod-right-split`）で行い、判定不能時は通常ペイン扱い。  
6. `basesViewListCollapsed` は移行互換のため設定データに残っても、挙動決定には使用しない。
