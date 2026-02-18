# BasesViewList 再描画で Base 本体も更新（2026-02-18）

## 目的
- view一覧コンテキストメニューの `Redraw view list` 実行時に、view一覧だけでなく該当 `bases` leaf 本体も再描画する。

## 実装方針
1. `BasesViewListSidebarService.redrawViewList()` 内で `leaf.view.refresh()` を防御的に呼ぶ。
2. `refresh()` が未定義・失敗時は従来どおり view一覧のみ再描画にフォールバック。
3. 既存の `cleanupLeaf` → `refreshLeaf` は維持して、view一覧再構築の挙動は変えない。

## 変更対象
- `src/bases/BasesViewListSidebarService.ts`
- `tests/unit/bases/BasesViewListSidebarService.test.ts`
- `AIdocs/LOG-20260218.md`
- `AIdocs/IMPLEMENTATION.md`

## 検証観点
1. `Redraw view list` 実行時に `leaf.view.refresh()` が1回呼ばれる。
2. 既存どおり view一覧のDOM再構築が行われる。
3. `refresh()` が存在しない/例外でもクラッシュしない。
