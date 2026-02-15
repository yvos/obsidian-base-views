# PLAN-20260215 Basesビュー一覧右クリック拡張

## 目的
`Bases view一覧` の右クリックメニューから、以下を操作できるようにする。
- フォントサイズ切替（Default / Small / Very Small）
- view一覧の再描画

## 実装タスク
- [x] `src/bases/BasesViewListSidebarService.ts` の右クリックメニュー項目を拡張
- [x] フォントサイズ保存/再描画処理と、対象leafの再描画アクションを追加
- [x] `src/i18n/resources/en.ts` / `src/i18n/resources/ja.ts` に文言キーを追加
- [x] `tests/unit/bases/BasesViewListSidebarService.test.ts` の期待値と検証を更新
- [x] `AIdocs/LOG-20260215.md` と `AIdocs/IMPLEMENTATION.md` を更新

## 実装結果
- 右クリックメニュー（一覧全体/行）にフォントサイズ切替3項目を追加。
- 右クリックメニューに「ビュー一覧を再描画」項目を追加。
- 既存項目（description編集、プロパティ表示、ネイティブツールバー表示、left/top切替）は維持。

## 受け入れ条件
- view一覧の右クリックメニューにフォントサイズ切替項目が表示され、選択時に一覧へ反映・保存される
- view一覧の右クリックメニューに再描画項目が表示され、選択時に一覧が再構築される
- 既存の項目（配置切替、property表示切替、native toolbar表示切替、description編集）が維持される
