# PLAN-20260217 BasesView行3点メニュー初回クリック改善

## 目的
- Obsidian起動直後の初回3点クリックで無反応になる事象を低減し、1回目から設定UI起動しやすくする。
- 既存のネイティブview設定導線（`openNativeViewSettingsAtAnchor`）を維持したまま、起動待ちと再試行を強化する。

## 仮説
- 起動直後はネイティブviewsメニュー生成が遅延し、現行待機時間内に `openedMenu` 検出できない。
- 3点ボタンが hover/focus 依存で非表示かつ `pointer-events: none` のため、初回クリックが空振りしやすい。

## 方針
- `src/integrations/bases/nativeViewSettingsBridge.ts`
  - viewsメニュー起動待機を延長。
  - 開かなかった場合の再試行（`click()` / key dispatch）を追加。
  - ネイティブツールバー表示復帰直後の1フレーム待機を追加。
- `styles/bases-views.css`
  - active行の3点ボタンは常時表示・クリック可能にして初回空振りを抑制。

## 実装タスク
- [x] bridgeの `openViewsMenu` を再試行対応に更新
- [x] bridgeの待機時間を起動直後に耐える設定へ延長
- [x] `wasHidden` 復帰時にクリック前1フレーム待機を追加
- [x] active行3点ボタンの表示/クリック性をCSSで改善
- [x] `AIdocs/LOG-20260217.md` に改善内容を追記

## 受け入れ条件
- 起動直後の初回クリックでも設定UI起動率が向上する（少なくとも無反応頻度が下がる）。
- 通常のview切替クリックや右クリック挙動に回帰がない。

## 検証メモ
- 実施: `obsidian vault=vaultforplugin eval ...` でネイティブviewsメニューが正常に開くことを確認（`{"ok":true,"rowCount":11}`）。
- 未実施: `npm test` / `npm run typecheck`（`npm: command not found`）。

## 追加実施（再調査反映）
- [x] viewsメニューを「可視 + 行生成済み」まで待つ判定を追加
- [x] hidden時のみネイティブメニュー位置を3点アンカー近傍へ再配置する試行を追加
- [x] hidden時のツールバー再非表示をメニュークローズまで遅延
- [x] 3点ボタンの `pointer-events` を常時有効化
