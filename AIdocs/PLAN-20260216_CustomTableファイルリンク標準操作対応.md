# PLAN-20260216 CustomTableファイルリンク標準操作対応

## 目的
- Custom Table (`tasknotesCustomTable`) の `file.name` リンクに、通常のリンク操作（右クリックのファイルコンテキストメニュー、中クリック新規ペイン）を追加する。
- Iconic アイコン取得は `AIdocs/iconic-api.md` 準拠（`getFileItem` + `settings.fileIcons`）を維持し、rule-based icon は対象外とする。

## 実装タスク
- [x] `src/bases/CustomTableView.ts` の `renderFileLink()` を改修
- [x] `file.name` リンクに `internal-link` / `data-href` を付与
- [x] 中クリック（`auxclick`）で新規ペインオープンを追加
- [x] 右クリック（`contextmenu`）で `file-menu` を表示
- [x] `file-menu` 空時の最小フォールバック（Open / Open in new tab）を追加
- [x] `AIdocs/LOG-20260216.md` へ実装内容と判断理由を追記
- [x] `AIdocs/IMPLEMENTATION.md` に実装状態を反映

## 受け入れ条件
- `file.name` 通常クリックで従来どおりノートを開ける
- `Ctrl/Cmd+クリック` と中クリックで新規ペインに開ける
- 右クリックで通常のファイルコンテキストメニューが表示される
- `workspace.trigger("file-menu", ...)` が空でもフォールバック項目で操作できる
- Iconic 表示は現行仕様どおり（`getFileItem/settings.fileIcons` のみ）で維持される
