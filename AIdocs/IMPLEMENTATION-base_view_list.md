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
  1. `controller.query.views[]`（`name/type`）
  2. `controller.getQueryViewNames()`（`name`のみ）
  3. `.base` YAML `views[].{name,type}`
- view切替優先順:
  1. `controller.selectView(viewName)`
  2. `workspace.openLinkText(`${file.path}#${viewName}`, file.path, false)`
- view件数挙動:
  - `<= 1` の場合は一覧UI・開くトグルを表示しない（完全非表示）
- アイコン表示:
  - `bases.registrations[type].icon` 優先
  - 既知typeマップ fallback
  - 未知は `list`
- 開閉UI:
  - 開状態: ヘッダー左の `x` で閉じる
  - 閉状態: toolbar左端の `list-plus` で開く
- 幅リサイズ:
  - 右端ハンドルのドラッグで幅変更
  - 保存範囲: `140..520px`（初期値 `220px`）
- 永続化:
  - `basesViewListCollapsed`（global）
  - `basesViewListWidthPx`（global）

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
- 内部API/内部構造
  - `bases controller.query.views`
  - `bases controller.selectView/getQueryViewNames`
  - `app.internalPlugins.getEnabledPluginById("bases").registrations`

## 4. 切り出し時に残す最小インターフェース
- 設定I/O境界
  - `getSettings(): { enabled, dropdownMode, collapsed, widthPx }`
  - `setSettings(partial): Promise<void>`
- i18n境界
  - 必須キーのみ提供する `t(key, fallback)`
- icon解決境界
  - `resolveViewTypeIcon(type): string`
- lifecycle境界
  - `start()` / `stop()`
  - `refresh()`

## 5. 既知制約
- 内部API依存のため、Obsidian/Bases更新で挙動変更の可能性あり。
- `bases.registrations` 未取得時はアイコン精度が落ちる（`list` fallback）。
- 現行実装はグローバル保存であり、ファイル別の開閉/幅記憶は未対応。

## 6. テスト観点
- 単体:
  - 単一view時の完全非表示
  - icon解決（registrations / unknown fallback）
  - 開閉トグルの保存挙動
  - 幅ドラッグ更新とclamp
  - refresh連打での非増殖
- 手動:
  - 複数base間移動で開閉状態・幅の維持
  - list-only / combined の既存挙動維持

## 7. 実装ファイル
- `src/bases/BasesViewListSidebarService.ts`
- `styles/bases-views.css`
- `src/types/settings.ts`
- `src/settings/defaults.ts`
- `src/main.ts`
- `src/i18n/resources/en.ts`
- `src/i18n/resources/ja.ts`
- `tests/unit/bases/BasesViewListSidebarService.test.ts`
