# PLAN-20260215_Basesビュー一覧UX追加改善

## 1. 目的
- Bases view一覧に以下のUX追加改善を実装する。
  - フォントサイズ連動のアイコン/行高
  - 上端表示の折返し/横スクロール切替
  - 狭幅時の自動挙動（none/top/hide + 閾値）
  - アイコン表示ON/OFF
  - `.base` への `formulas.viewListSize` 永続化（ファイル別優先）
  - view行右クリックの `description` 編集

## 2. 実装タスク
- [x] `BaseViewListYamlStore` を新規作成し、`viewListSize` / `description` 更新責務を分離
- [x] `BasesViewListSidebarService` へ以下を実装
  - [x] 狭幅判定（container幅ベース）と挙動分岐
  - [x] `ResizeObserver` で幅変化追従
  - [x] top overflow `wrap/scroll` クラス切替
  - [x] アイコン表示ON/OFF
  - [x] 右クリックメニューの拡張（description編集 + 配置切替共存）
  - [x] 手動幅変更時の `formulas.viewListSize` 保存/削除
- [x] 設定型/デフォルト/migration を更新
- [x] 設定UI（General > Bases Integration）を拡張
- [x] i18nキー（ja/en）を追加
- [x] CSSを更新（フォント連動変数、行高、top overflow、icons-off）
- [x] Unit test を更新/追加
- [x] 実装ドキュメントとログを更新

## 3. 検証計画
- Unit:
  - `BasesViewListSidebarService.test.ts`
  - `BaseViewListYamlStore.test.ts`
- Manual:
  - left/top、icon ON/OFF、top wrap/scroll、狭幅挙動、description編集、`viewListSize` 反映

## 4. 実行結果メモ
- `npm` コマンドが環境に存在せず、テスト実行は未完了（`/bin/bash: npm: command not found`）。
