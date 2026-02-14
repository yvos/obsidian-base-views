# PLAN-20260214 Basesビュー一覧サイドバー

## 目的
- `.base` ファイル表示時に、`div.bases-view` 左側（狭幅時は上部）へ view 一覧を表示し、クリックで view 切替できる機能を追加する。
- 設定で機能 ON/OFF と既存プルダウン表示モード（一覧のみ/併用）を切り替え可能にする。
- 切替と一覧取得は内部API優先、公開APIフォールバックで安定動作させる。

## スコープ
- `src/bases/BasesViewListSidebarService.ts` 新規作成
- settings 型/初期値/UI/i18n/CSS の追加
- `src/main.ts` へライフサイクル連携追加
- 単体テスト追加
- `AIdocs/LOG-20260214.md` と `AIdocs/IMPLEMENTATION.md` 更新

## 実装タスク
- [x] サービス実装（監視・DOM注入・切替・フォールバック・cleanup）
- [x] settings 追加（型/初期値）
- [x] 設定UI追加（General > Views & base files）
- [x] i18n 追加（en/ja）
- [x] CSS 追加（レイアウト/表示モード/レスポンシブ）
- [x] main.ts 連携（起動/停止/設定変更反映）
- [x] 単体テスト追加
- [x] 検証実施
- [x] LOG/IMPLEMENTATION 更新

## 検証メモ
- Obsidian CLI（`vaultforplugin`）で `Guides/テストベース.base` を開き、内部APIの存在を確認。
  - `controller.getQueryViewNames()` が `["Table","custom view","ビュー"]` を返すことを確認。
  - `controller.selectView("ビュー")` で実際に view が切り替わることを確認。
  - `app.workspace.openLinkText("Guides/テストベース.base#custom view", "", false)` で view 切替できることを確認。
- 単体テストは追加済みだが、実行環境に `npm` が無いため未実行。

## 受け入れ条件
- `.base` 表示中のみ view 一覧が表示される
- 一覧クリックで該当 view に切替できる
- 設定 OFF 時は DOM 改変しない
- `list-only` / `combined` が反映される
- unload や設定変更でリークしない
