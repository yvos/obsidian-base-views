# Bases View 設定起動: 待機判定簡素化とデバッグログ撤去

## 概要
3点メニューの設定起動は現状安定しているため、過剰な診断ロジックを整理する。

## 実装方針
1. `waitForNativeToolbarLayoutReady` の判定を簡素化する。
2. 初回クリック不発切り分けのために追加した `console.log` を撤去する。
3. 動作ロジック（3点起動、pointerdown優先、Notice分岐）は維持する。

## タスク
1. [x] `src/bases/BasesViewListSidebarService.ts` の待機条件を整理。
   - `isConnected` 条件を削除
   - `stableFramesRequired` を 3 から 2 へ
   - `hasFinitePosition` 中間条件を削除
2. [x] `src/bases/BasesViewListSidebarService.ts` の ViewSettings デバッグログを削除。
3. [x] `src/integrations/bases/nativeViewSettingsBridge.ts` の ViewSettingsBridge デバッグログを削除。
4. [x] `AIdocs/IMPLEMENTATION.md` と `AIdocs/LOG-20260217.md` を整合更新。
