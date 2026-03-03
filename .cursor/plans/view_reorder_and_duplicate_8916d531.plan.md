---
name: View reorder and duplicate
overview: View一覧にドラッグ&ドロップによるView並び替え機能と、コンテキストメニューからのView複製機能を追加する。
todos:
  - id: yaml-reorder
    content: BaseViewListYamlStore に reorderViews() メソッドを追加（views配列順序の保存）
    status: completed
  - id: yaml-duplicate
    content: BaseViewListYamlStore に duplicateView() メソッドを追加（name以外の全プロパティをコピー）
    status: completed
  - id: drag-render
    content: renderViewList() にドラッグ&ドロップイベントを実装（3点ボタン上はドラッグ開始無効）
    status: completed
  - id: drag-css
    content: bases-views.css にドラッグ用スタイルを追加
    status: completed
  - id: refresh-redraw
    content: 並び替え/複製成功時の反映を redrawViewList() ベースに統一
    status: completed
  - id: ctx-duplicate
    content: showViewItemContextMenu() に「Viewを複製」を追加（成功時 redrawViewList）
    status: completed
  - id: i18n-keys
    content: en.ts / ja.ts にコンテキストメニュー用翻訳キーを追加
    status: completed
  - id: tests
    content: BaseViewListYamlStore / BasesViewListSidebarService のユニットテストを追加
    status: completed
  - id: update-docs
    content: IMPLEMENTATION.md / LOG に変更内容を記録
    status: completed
isProject: false
---

# View一覧のドラッグ並び替え + View複製機能

## 前提

- View一覧UIは `BasesViewListSidebarService.renderViewList()` で描画される
- 各View行は `div.tn-bases-view-list__item-row[data-view-name]` > `button.tn-bases-view-list__item` 構造
- `.base` ファイルのYAML読み書きは `BaseViewListYamlStore` が担当（`readRoot()` / `writeRoot()`）
- コンテキストメニューは `showViewItemContextMenu()` で構築されており、既に `description編集` 項目がある
- i18nに `dragToReorder` キーが既に定義済み（en/ja両方）

## 機能1: View一覧のドラッグ&ドロップ並び替え

### 方針

- HTML Drag and Drop API を使用（`draggable="true"`, `dragstart`/`dragover`/`drop`/`dragend` イベント）
- ドラッグ対象はView行（`CSS_ITEM_ROW`）だが、開始許可はView名ボタン領域（`CSS_ITEM`）のみ
- 3点ボタン（`CSS_ITEM_MENU_BUTTON`）上でのドラッグ開始は無効化する（`draggable=false` + `dragstart`/`pointerdown` ガード）
- ドロップ位置のフィードバックとして、ドラッグ先行の上下に挿入インジケータ（CSS線）を表示
- ドロップ確定時に `.base` YAML の `views[]` 配列を並び替え、成功時は `redrawViewList()` で即時再描画する（`scheduleRefresh(0)` 前提にはしない）

### 変更ファイル

#### 1. [src/bases/BaseViewListYamlStore.ts](src/bases/BaseViewListYamlStore.ts) に `reorderViews()` を追加

```typescript
async reorderViews(file: TFile, orderedNames: string[]): Promise<boolean>
```

- `readRoot()` で YAML を取得
- `root.views` 配列を `orderedNames` の順序で並び替え（名前一致で照合）
- YAML にない名前は無視、YAML にあるが `orderedNames` にない view は末尾に追加
- 並び順が実質不変なら保存せず `false` を返す
- `writeRoot()` で保存
- 成功時 `true`、変更なし/失敗時 `false`

#### 2. [src/bases/BasesViewListSidebarService.ts](src/bases/BasesViewListSidebarService.ts)

- `renderViewList()` 内で各 `rowEl` に `draggable="true"` を設定し、ドラッグイベントを登録:
  - `dragstart`: ドラッグ中のview名を `dataTransfer` に保持、ドラッグ元行にスタイル付与（3点ボタン起点は中断）
  - `dragover`: ドロップ位置の上半分/下半分を判定し、挿入インジケータCSSクラスを付与
  - `dragleave`: インジケータCSSクラスを除去
  - `drop`: ドラッグ元とドロップ先のview名を確定し、`yamlStore.reorderViews()` 呼び出し
  - `dragend`: 全てのドラッグ関連CSSクラスをクリーンアップ
- 並び替え成功時は `redrawViewList(leaf)` を呼び、`leaf.refresh()` を含む再描画で反映を保証
- 新しいCSS定数を追加: `CSS_ITEM_DRAGGING`, `CSS_ITEM_DROP_BEFORE`, `CSS_ITEM_DROP_AFTER`

#### 3. [styles/bases-views.css](styles/bases-views.css) にドラッグ用スタイルを追加

- `.tn-bases-view-list__item-row` に `cursor: grab` を追加（ドラッグ中は `grabbing`）
- ドラッグ中の行を半透明化（`opacity: 0.4`）
- ドロップ先インジケータ: `::before` / `::after` 疑似要素で 2px の境界線を表示
- top配置時は左右方向のインジケータに変更

#### 4. i18n（[src/i18n/resources/en.ts](src/i18n/resources/en.ts), [src/i18n/resources/ja.ts](src/i18n/resources/ja.ts)）

- contextMenu セクションに並び替え失敗時の Notice 用キーを追加（必要に応じて）
- 既存の `dragToReorder` キーはツールチップ等で流用可能

## 機能2: コンテキストメニューに「Viewを複製」を追加

### 方針

- 各View行の右クリックメニュー（`showViewItemContextMenu()`）に「Duplicate view」項目を追加
- 複製先の名前は元名に `_2`, `_3` ... と連番サフィックスを付与（既存名と重複しない最小番号）
- 複製したViewは元のViewの直後に挿入
- 複製時は `name` 以外のプロパティをすべてそのままコピーする（`description` を含む）

### 変更ファイル

#### 1. [src/bases/BaseViewListYamlStore.ts](src/bases/BaseViewListYamlStore.ts) に `duplicateView()` を追加

```typescript
async duplicateView(file: TFile, sourceViewName: string): Promise<string | null>
```

- `readRoot()` でYAMLを取得し、`root.views` 配列から `sourceViewName` に一致するviewオブジェクトを探す
- 見つけたら `cloneRecord()` で viewオブジェクト全体を deep copy する
- 新しい名前を決定: `${sourceViewName}_2` が存在すれば `_3`, `_4` ... と探索
- コピーの `name` のみ新しい名前に変更（それ以外のプロパティは無変更）
- 元viewの直後の位置に配列挿入（`splice`）
- `writeRoot()` で保存
- 成功時は新しいview名を返す、失敗時は `null`

#### 2. [src/bases/BasesViewListSidebarService.ts](src/bases/BasesViewListSidebarService.ts)

- `showViewItemContextMenu()` に「Duplicate view」メニュー項目を追加（`editDescription` の下）
- クリック時に `duplicateView()` を呼び、成功したら `redrawViewList(leaf)` で再描画
- i18n対応のラベル取得メソッド `getContextMenuDuplicateViewLabel()` を追加

#### 3. i18n（[src/i18n/resources/en.ts](src/i18n/resources/en.ts), [src/i18n/resources/ja.ts](src/i18n/resources/ja.ts)）

- contextMenu セクションに追加:
  - en: `duplicateView: "Duplicate view"`
  - ja: `duplicateView: "ビューを複製"`

## テスト計画

- `tests/unit/bases/BaseViewListYamlStore.test.ts`
  - `reorderViews()` が指定順で保存されること
  - `orderedNames` にないviewが末尾保持されること
  - 並び替えが実質無変更なら `modify` されないこと
  - `duplicateView()` が `name` 以外（`description` 含む）を保持して複製されること
- `tests/unit/bases/BasesViewListSidebarService.test.ts`
  - 並び替え操作成功時に `redrawViewList()` 相当の再描画フローが呼ばれること
  - 3点ボタン上でドラッグ開始されないこと
  - View行右クリックメニューの「Duplicate view」実行で複製 + 再描画されること

## 注意事項

- `.base` の `views[]` 順序変更/複製は、Bases ネイティブ側の `controller.query.views[]` と独立。即時反映は `scheduleRefresh(0)` ではなく `redrawViewList()`（`leaf.refresh()` + `refreshLeaf()`）で保証する
- `stringifyYaml` による再シリアライズでYAML内のコメントや書式は保持されない（既存の `updateViewDescription()` 等と同様の制約）
- 3点ボタンは既存機能（ネイティブview設定導線）を維持し、ドラッグ操作とは干渉させない
- top配置時のドラッグは横方向の並び替えとなるが、ドラッグ APIの挙動は同じ（インジケータの方向のみCSS調整）
