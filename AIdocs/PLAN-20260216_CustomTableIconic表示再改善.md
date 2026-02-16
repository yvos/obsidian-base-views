# PLAN-20260216 CustomTableIconic表示再改善

## 目的
- `tasknotesCustomTable` の `file.name` 列アイコン表示を、`AIdocs/recentFiles-main.ts` / `AIdocs/iconic.ts` の成功パターンに寄せて安定化する。
- Iconic 連携コードを `src/integrations/iconic/` へ分離し、CustomTable 側の責務を描画中心に整理する。

## 方針
- 対象範囲は CustomTable（`tasknotesCustomTable`）のみ。
- Iconic 解決順は `ruleManager.checkRuling("file", path)` → `getFileItem(path[, false])` → `settings.fileIcons[path]`。
- `icon` が空で `color` のみの場合は表示しない（既定アイコン補完なし）。
- Iconic は非公開APIのため、各経路を防御的に扱い、失敗時は通常表示へフォールバックする。

## 実装タスク
- [x] `src/integrations/iconic/types.ts` を新規作成し、Iconic連携の型を定義
- [x] `src/integrations/iconic/iconicFileIconResolver.ts` を新規作成し、rule優先 + fallback連鎖を実装
- [x] `src/bases/CustomTableView.ts` の Iconic 取得経路を新resolverへ置換
- [x] `src/bases/CustomTableView.ts` から `getIconicPlugin()` を削除
- [x] `src/bases/customTableDisplayUtils.ts` を group表示補助専用へ整理
- [x] `tests/unit/integrations/iconic/iconicFileIconResolver.test.ts` を新規追加
- [x] `tests/unit/bases/customTableDisplayUtils.test.ts` を更新（group見出しテストのみに整理）
- [x] `AIdocs/IMPLEMENTATION.md` を更新
- [x] `AIdocs/LOG-20260216.md` を更新
- [x] 本PLANファイルを追加し、完了状態を反映

## 受け入れ条件
- ruleのみ設定されたファイルでも `file.name` 左に Iconic アイコンが表示される。
- `getFileItem` / `settings.fileIcons` へのフォールバックが維持される。
- `icon` 空 + `color` のみはアイコン非表示となる。
- Iconic 未導入/内部API失敗時にエラーなく通常表示へフォールバックする。
- 既存リンク操作（通常クリック/CmdCtrl+クリック/中クリック/右クリックメニュー）に回帰がない。

## 検証メモ
- 実施: 静的確認（依存境界、fallback経路、テストケース追加）。
- 未実施: `npm test` / `npm run typecheck`（この環境で `npm` が利用不可: `npm: command not found`）。
