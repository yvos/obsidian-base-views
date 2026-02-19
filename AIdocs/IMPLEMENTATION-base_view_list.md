# IMPLEMENTATION-base_view_list

## 0. 位置づけ
- 本書は「Bases view一覧機能」単体の実装仕様と実装境界を整理した技術ノート。
- `AIdocs/IMPLEMENTATION.md` の補助ドキュメントとして扱う。
- 将来、この機能を独立プラグインへ切り出す際の設計インプットを目的とする。

## 1. 目的
- `.base` ファイル閲覧時に、クリックで切替可能な view一覧を表示する。
- 標準dropdownに依存しない導線を提供しつつ、既存UIとの共存を保つ。
- 将来切り出せるように、TaskNotes依存を限定した境界を明示する。

## 2. 現在の機能
- 対象leaf判定: `viewType === "bases"` かつ `file.extension === "base"`
- view取得優先順:
  1. `controller.query.views[]`（`name/type` + 設定キーのプロパティ値）
  2. `controller.getQueryViewNames()`（`name`のみ）
  3. `.base` YAML `views[].{name,type,<propertyKey>}`（fallback）
- view切替優先順:
  1. `controller.selectView(viewName)`
  2. `workspace.openLinkText(`${file.path}#${viewName}`, file.path, false)`
- view件数挙動:
  - `<= 1` の場合は一覧UI・開くトグルを表示しない（完全非表示）
- アイコン表示:
  - `bases.registrations[type].icon` 優先
  - 既知typeマップ fallback
    - `tasknotesCustomTable` は `table-cells-merge`
  - 未知は `list`
  - 設定でON/OFF切替可能（OFF時は行先頭アイコンを描画しない）
- 開閉UI:
  - 開状態: ヘッダー左の `x` で閉じる（leaf temporary を `none` に設定）
  - 閉状態: toolbar左端の `list-plus` で開く
    - 通常ペインでは temporary `left`
    - サイドペインでは temporary `top`
- ヘッダー表示:
  - left配置: タイトルは `baseファイル名（拡張子除く）`
  - top配置: タイトルなし（closeのみ）
- 配置モード:
  - `left`: 既存の左カラム + 右端resizer
  - `top`: `bases-header` 直下（fallback: toolbar直前）へ横並び表示
  - `none`: 一覧非表示 + toolbar open triggerのみ表示
  - `top` の並べ方は `wrap/scroll` を設定で切替可能
  - 切替導線:
    - plugin設定（main pane / side pane のデフォルト）
    - 一覧領域の右クリックメニュー（一時left/top + base永続left/top/none）
  - 最終決定優先順位: `temporary(leaf) > base formulas > plugin default`
  - 狭幅時は設定に応じて `none/top/hide` を適用
    - `top`: ユーザー配置が `left/top` のどちらでも一時的にtop表示（1行横スクロール強制）
    - `hide`: 狭幅中のみ一時非表示（閾値復帰で自動再表示）
  - ネイティブツールバー表示:
    - 設定 `basesViewListShowNativeToolbar` で `.bases-header` と `.bases-toolbar` の表示/非表示を切替
    - 一覧が非表示状態（`none` / 単一view / 狭幅hide / 機能OFF）では復帰導線維持のため強制表示
- view行表示:
  - view名は常に左寄せ
  - 設定ON時は2行目に viewプロパティを表示
  - top配置 + プロパティ表示ON時は、空値viewにも空行を描画して行高を統一
  - 配列値は `, ` 区切り
  - 空値は2行目を出さない
  - view行右クリックで `description` 編集モーダルを表示可能
  - 一覧右クリックでプロパティ表示ON/OFFを切替可能（base formulaへ保存、plugin設定は既定値として維持）
  - 一覧右クリックで表示プロパティキーを変更可能（存在しないキー入力時はbase override削除）
  - 一覧右クリックでフォントサイズ（`Default/Small/Very Small`）を切替可能
  - 一覧右クリックで view一覧の再描画を実行可能
  - 編集モーダルは既存descriptionをplaceholder表示し、空文字で確定すると `description` キー削除
- フォントサイズ:
  - 内部値 `m/s/xs`（表示ラベルは `Default / Small / Very Small`）を設定で選択
  - view名 + プロパティ行 + アイコンサイズ + 行高を連動
- 幅リサイズ:
  - 右端ハンドルのドラッグで幅変更
  - 保存範囲: `140..520px`（初期値 `220px`）
  - 保存先は `.base` の `formulas.viewListSize`（文字列として保存）
- 自動幅短縮:
  - left配置かつ `viewListSize` 未設定時（実質初期幅220px）のときのみ有効
  - 表示内容（view名 + プロパティ）に応じて `140..220px` へ短縮
  - 自動短縮値は非永続
- 永続化:
  - `basesViewListPlacement`（global default: main pane）
  - `basesViewListSidePanePlacement`（global default: side pane）
  - `basesViewListFontSize`（global）
  - `basesViewListShowProperty`（global default）
  - `basesViewListPropertyKey`（global default）
  - `basesViewListShowNativeToolbar`（global）
  - `basesViewListShowIcons`（global）
  - `basesViewListTopOverflowMode`（global default）
  - `basesViewListNarrowBehavior`（global）
  - `basesViewListNarrowThresholdPx`（global）
  - `formulas.tnViewListPosition`（per `.base`, main pane override）
  - `formulas.tnViewListSidePanePosition`（per `.base`, side pane override）
  - `formulas.tnViewListShowProperty`（per `.base`）
  - `formulas.tnViewListPropertyKey`（per `.base`）
  - `formulas.tnViewListTopOverflowMode`（per `.base`）
  - `formulas.viewListSize`（per `.base`）

## 3. 依存関係

### 3.1 TaskNotes固有依存
- `TaskNotesPlugin` インスタンス
  - `settings` 読み書き
  - `saveSettings()`
  - `emitter.on("settings-changed")`
  - `i18n.translate(...)`

### 3.2 Obsidian依存
- 公開API
  - `workspace.openLinkText(...)`
  - `setIcon(...)`
  - `parseYaml(...)`
  - `stringifyYaml(...)`
  - `Menu(...)`（右クリックメニュー）
- 内部API/内部構造
  - `bases controller.query.views`
  - `bases controller.selectView/getQueryViewNames`
  - `app.internalPlugins.getEnabledPluginById("bases").registrations`

## 4. 切り出し時に残す最小インターフェース
- 設定I/O境界
  - `getSettings(): { enabled, dropdownMode, placement, sidePanePlacement, fontSize, showPropertyDefault, propertyKeyDefault, showNativeToolbar, showIcons, topOverflowModeDefault, narrowBehavior, narrowThresholdPx }`
  - `setSettings(partial): Promise<void>`
- i18n境界
  - 必須キーのみ提供する `t(key, fallback)`
- icon解決境界
  - `resolveViewTypeIcon(type): string`
- property抽出境界
  - `resolveViewPropertyText(view, propertyKey): string | null`
- lifecycle境界
  - `start()` / `stop()`
  - `refresh()`

## 5. 既知制約
- 内部API依存のため、Obsidian/Bases更新で挙動変更の可能性あり。
- `bases.registrations` 未取得時はアイコン精度が落ちる（`list` fallback）。
- 開閉状態は global保存せず、leaf temporary state + base formula + plugin default の解決で扱う。
- `basesViewListCollapsed` は互換目的で設定データに残るが、挙動決定には使用しない。
- 幅は `.base` 側 `formulas.viewListSize` のみを永続値として使用する。
- `basesViewListDropdownMode` は views dropdown の表示制御のみを担当し、ネイティブツールバー全体の表示制御は `basesViewListShowNativeToolbar` が担当する。
- `formulas.viewListSize` は Bases 側仕様に合わせて文字列値で保存し、利用時に数値へ変換する。
- 自動幅短縮は推定幅ロジックであり、テーマ/フォント差で厳密値ではない。
- top配置の挿入先は `bases-header` 優先で、DOM差異時は toolbar直前へフォールバックする。
- YAML書き戻しは `parseYaml/stringifyYaml` ベースのため、フォーマット差分が発生する場合がある。

## 6. テスト観点
- 単体:
  - 単一view時の完全非表示
  - icon解決（registrations / unknown fallback）
  - left/top配置切替とヘッダー表示仕様
  - closeボタン小型クラス
  - フォントサイズクラス（M/S/XS）
  - property表示ON/OFF・空値非表示・配列のカンマ区切り
  - top配置 + プロパティ表示ON時の行高統一（空値行の空行描画）
  - icon表示ON/OFF
  - top overflow (`wrap/scroll`)
  - 狭幅挙動 (`none/top/hide`) と閾値
  - ネイティブツールバー表示ON/OFFと一覧非表示時の強制表示
  - 自動幅短縮（初期幅時のみ）
  - 右クリックメニュー生成（view行でdescription編集項目が追加）
  - 右クリックメニューでプロパティ表示ON/OFF・ネイティブツールバーON/OFFトグル
  - 右クリックメニューで表示プロパティ変更（存在チェック + fallback）
  - 右クリックメニューで base永続left/top/none のトグル保存
  - 右クリックメニューでフォントサイズ切替と再描画アクション
  - `none` 初期表示 + open trigger + close復帰挙動
  - temporary left/top が leaf限定で永続化されないこと
  - 幅ドラッグ更新とclamp（`formulas.viewListSize` 保存/削除）
  - refresh連打での非増殖
- 手動:
  - 複数base間移動で base永続設定（position/property/overflow）と幅が独立して維持されること
  - 配置切替（設定/右クリック）の即時反映
  - top配置の挿入位置（`bases-header` 直下）
  - list-only / combined の既存挙動維持

## 7. 実装ファイル
- `src/bases/BasesViewListSidebarService.ts`
- `src/bases/BaseViewListYamlStore.ts`
- `styles/bases-views.css`
- `src/types/settings.ts`
- `src/settings/defaults.ts`
- `src/main.ts`
- `src/settings/tabs/generalTab.ts`
- `src/i18n/resources/en.ts`
- `src/i18n/resources/ja.ts`
- `tests/unit/bases/BasesViewListSidebarService.test.ts`
- `tests/unit/bases/BaseViewListYamlStore.test.ts`

## 8. 2026-02-19 調査結果（切り出し検討向け）

### 8.1 Task List View の登録・表示に関わる主要ファイル
- 登録導線
  - `src/main.ts`: plugin起動時に `registerBasesTaskList()` を呼び、終了時に `unregisterBasesViews()` を呼ぶ。
  - `src/bases/registration.ts`: `tasknotesTaskList` の view ID・表示名・icon・option を定義して登録する。
  - `src/bases/api.ts`: `registerBasesView()` / `unregisterBasesView()` のBases APIラッパーを提供する。
- 表示導線
  - `src/bases/TaskListView.ts`: Task List本体。データ抽出、grouped/flat描画、仮想スクロール、TaskCard描画連携を担当。
  - `src/bases/TaskSearchFilter.ts`: 検索ボックスのフィルタ処理を担当。
  - `src/bases/groupTitleRenderer.ts`: group見出し文字列のリンク化描画を担当。

### 8.2 Custom View（`tasknotesCustomTable`）の登録・表示に関わる主要ファイル
- 登録導線
  - `src/main.ts`: Task Listと同じ登録導線で一括登録される。
  - `src/bases/registration.ts`: `tasknotesCustomTable` の view ID・option（subGroup/unnest/rowHeight）を定義して登録する。
- 表示導線
  - `src/bases/CustomTableView.ts`: Custom Table本体。表描画、grouping、summary、列幅、重複行ジャンプ、仮想スクロール統合を担当。
  - `src/bases/customTableGrouping.ts`: グルーピングキー抽出・unnest・並べ替え。
  - `src/bases/customTableVirtualization.ts`: 仮想化閾値判定とgrouped平坦化。
  - `src/bases/customTableDisplayUtils.ts`: 見出し表示整形。
  - `src/bases/customTableDuplicateNavigation.ts`: 同一 `file.path` 行の循環ジャンプ計算。
  - `src/bases/tableColumnSizing.ts`: 列幅正規化・保存値計算。
  - `src/bases/tableSummary.ts`: summary候補・集計計算。

### 8.3 Bases view一覧の登録・表示に関わる主要ファイル
- 起動/終了導線
  - `src/main.ts`: `BasesViewListSidebarService` を生成して `start()/stop()` を呼ぶ。
- 表示・永続・ネイティブ設定導線
  - `src/bases/BasesViewListSidebarService.ts`: view一覧DOM注入、配置解決、クリック切替、右クリックメニュー、再描画を担当。
  - `src/bases/BaseViewListYamlStore.ts`: `.base` YAML の `formulas` / `views[].description` 読み書き。
  - `src/integrations/bases/nativeViewSettingsBridge.ts`: 3点メニューからネイティブview設定UI起動。
  - `src/integrations/bases/types.ts`: 上記ブリッジの型。
- 設定導線
  - `src/settings/tabs/generalTab.ts`: 設定画面のview一覧関連UI。
  - `src/settings/defaults.ts`: view一覧設定の初期値。
  - `src/types/settings.ts`: view一覧設定型。
  - `styles/bases-views.css`: view一覧UIスタイル。

### 8.4 検討中案への示唆（技術観点）
- 案1（Task List Viewのmodified版追加）
  - `src/bases/TaskListView.ts` を直接改変せず、`TaskListViewModified.ts` を追加して別view IDで `registration.ts` に追記する方が安全。
  - 既存 `tasknotesTaskList` と共存できるため、挙動比較と段階移行が容易。
- 案2（bases機能のみの別リポジトリ化）
  - 最小コアは `src/bases/`（Task List / Custom Table / view一覧関連）、`src/integrations/bases/`、該当設定型/UI、`styles/bases-views.css`。
  - `src/api/`, `src/views/`, `src/services/` の大半、calendar/pomodoro/ICS/editor系は分離対象（bases以外機能）。
