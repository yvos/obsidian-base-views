# 0. この文章の意義、位置づけ
このファイルは、TaskNotes の**現在の実装状態**を共有するためのスナップショットです。  
最終仕様は `AIdocs/SPEC.md`（存在する場合）を優先し、本書は仕様確定文書ではありません。

# 1. 実装状況のサマリー
- Bases 連携として、Task List / Kanban / Calendar / Mini Calendar の各カスタムビューを実装済み。
- 2026-02-09 時点で `tasknotesCustomTable`（Custom Table View）を追加し、テーブル表示と組み込み summary を実装。
- 2026-02-12 時点で `tasknotesCustomTable` の再描画タイミングを最適化し、初回更新・設定変更時の待機を短縮。
- 2026-02-12 時点で `tasknotesCustomTable` に仮想スクロールを段階導入し、ungrouped / grouped の大規模データ描画を高速化。
- Custom Table View は MVP 範囲（表示中心）で、セル編集や複数セル操作は未対応。

# 2. 実装済み機能
- Bases カスタムビュー登録/解除
  - `tasknotesTaskList`
  - `tasknotesCustomTable`
  - `tasknotesKanban`
  - `tasknotesCalendar`
  - `tasknotesMiniCalendar`
- Custom Table View (`tasknotesCustomTable`)
  - Base フィルタ結果の全エントリを 1行=1ファイルで表示
  - `config.getOrder()` に従った列順
  - grouped / ungrouped 両対応
  - `file.name` 列のリンク描画（クリックでノートを開く）
  - `Value.renderTo(...)` 優先 + `toString()` フォールバック
  - 行高設定（`short` / `medium` / `tall` / `extraTall`）
    - 固定行高として適用（`short=32px`, `medium=40px`, `tall=56px`, `extraTall=72px`）
  - 列ごとの summary 設定（右クリック）
  - `tableSummaries` の config 永続化
  - 再描画タイミング最適化
    - 初回データ更新と view 設定変更（sort/order/group/options）は即時描画
    - 通常データ更新のみ短デバウンス（120ms）
  - 仮想スクロール（自動閾値切替）
    - ungrouped: `entries.length >= 200` で仮想描画
    - grouped: flatten後 `items.length >= 300` で仮想描画
    - overscan: `6`
    - 閾値未満は従来描画を維持
  - grouped 仮想化の内部モデル
    - `group-header -> group-summary -> row` の順でフラット化して描画
- 組み込み summary
  - 共通: `empty`, `filled`, `unique`
  - 数値: `sum`, `avg`, `min`, `max`
  - 日付: `earliest`, `latest`, `range`
  - 真偽: `checked`, `unchecked`

# 3. ファイル構造
- `src/bases/CustomTableView.ts`
  - Custom Table View 本体
- `src/bases/customTableVirtualization.ts`
  - 仮想化判定と grouped フラット化ロジック
- `src/bases/tableSummary.ts`
  - summary 判定・集計の純粋関数
- `src/bases/registration.ts`
  - Bases view の登録/解除
- `src/bases/api.ts`
  - Bases API ラッパー型
- `src/releaseNotes.ts`
  - リリースノート束ね込みファイルのフォールバック（未生成時のコンパイル用）
- `styles/bases-views.css`
  - Bases 系 view のスタイル
- `tests/unit/bases/tableSummary.test.ts`
  - summary ロジックのユニットテスト
- `tests/unit/bases/customTableVirtualization.test.ts`
  - 仮想化閾値判定ロジックのユニットテスト
- `tests/unit/bases/customTableGroupedFlatten.test.ts`
  - grouped フラット化順序のユニットテスト

# 4. データ構造
- `tableSummaries: Record<propertyId, summaryKey>`
  - Custom Table View の列ごとの summary 設定
  - `BasesViewConfig.set/get("tableSummaries")` で保存
- `rowHeight: "short" | "medium" | "tall" | "extraTall"`
  - View option から取得する行高設定
- `VirtualGroupedItem`
  - grouped 仮想描画で使用する内部表現
  - `group-header` / `group-summary` / `row` の3種を保持

# 5. 挙動の詳細や注意点
- grouped 時は各グループのテーブル先頭に summary 行を表示。
- ungrouped 時はテーブル下部（tfoot）に summary 行を表示。
- 仮想描画時も summary を維持する。
  - ungrouped: 仮想リスト下部に全体 summary 行
  - grouped: 各グループ header 直下に group summary 行
- 仮想行は `display: grid` をインラインでも指定し、テーマやCSS競合時の列崩れを抑制している。
- スクロール責務は基本的に `tn-bases-table-scroll`（縦）と `tn-bases-table-wrapper`（横）で分離している。
- 仮想レイアウト再構築時は `virtualColumnTemplate` / `virtualMinWidth` を再設定してからヘッダー/行を生成する実装となっている。
- 仮想行の区切り線は行単位で描画し、セル単位の高さ差で罫線がずれないようにしている。
- テキスト/リンクは行高設定に応じたline-clampを適用（`short/medium=1行`, `tall=2行`, `extraTall=3行`）。
- summary は設定された列のみ表示し、未設定列は空セル。
- セル描画は `Value.renderTo(...)` を試し、失敗時は文字列描画にフォールバック。
- TaskListView と違い、Custom Table View は TaskNotes 判定で絞り込まず Base の全エントリを表示。

# 6. SPEC との差分、ずれ
- `AIdocs/SPEC.md` が本リポジトリに存在しないため、差分評価は未実施。

# 7. 未実装な点
- セル直接編集（text/number/checkbox）
- 複数セル選択
- コピー/貼り付け
- Undo/Redo
- カスタム summary 式

# 8. 既知の制限
- 仮想スクロールは導入済みだが、セル編集・複数セル選択・コピー/貼り付けは未対応。
- grouped 仮想化ではグループ見出しの「固定表示（sticky）」は未対応。
- 検証コマンド（`npm run typecheck`, `npm run build`）は、実行環境に `node`/`npm` がないため未実行。
- `src/releaseNotes.ts` はビルド時に `generate-release-notes-import.mjs` で上書きされる想定。

# 9. AI向けの注意点
- Bases 実装の参照優先:
  - `src/bases/BasesViewBase.ts`
  - `src/bases/registration.ts`
  - `src/bases/api.ts`
- Custom Table View 変更時は以下を同時確認:
  - 表示ロジック: `src/bases/CustomTableView.ts`
  - 仮想化ロジック: `src/bases/customTableVirtualization.ts`
  - 集計ロジック: `src/bases/tableSummary.ts`
  - スタイル: `styles/bases-views.css`
  - テスト: `tests/unit/bases/tableSummary.test.ts`, `tests/unit/bases/customTableVirtualization.test.ts`, `tests/unit/bases/customTableGroupedFlatten.test.ts`
- `AIdocs/obsidian.d.ts` は必要箇所のみ参照し、通読しない。
