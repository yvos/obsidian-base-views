# PLAN-20260217 BasesView設定ログ追加とNativeToolbar表示固定

## 目的
- 3点ボタン初回無反応の切り分けのため、クリック検知とブリッジ内部処理を `console.log` で追跡できるようにする。
- 3点ボタンから設定起動時にネイティブツールバー非表示だった場合、非表示解除を一時的ではなく恒久ONにして設定UIを開きやすくする。

## 方針
- `src/bases/BasesViewListSidebarService.ts`
  - 3点ボタンクリック/キー操作、起動開始、結果、Notice分岐をログ出力。
  - 3点ボタンの `pointerenter` / `pointerdown` と row側 `pointerdown` も記録し、クリック未検知の切り分けを補強。
  - `basesViewListShowNativeToolbar=false` または hidden class 時は、その場でネイティブツールバー表示をON化（設定永続）。
  - `title` 属性を除去してツールチップ重複を解消し、hover時観測を明確化。
- `src/integrations/bases/nativeViewSettingsBridge.ts`
  - 起動シーケンスと各分岐（menu open, row resolve, settings open）にログを追加。
  - 前回追加した hidden時のメニュー座標補正・遅延復元は取り消す。

## 実装タスク
- [x] `BasesViewListSidebarService` にログヘルパーを追加
- [x] 3点ボタンの click/keydown 検知ログを追加
- [x] 3点ボタンの pointerenter/pointerdown と row pointerdown ログを追加
- [x] 3点ボタンの起動導線を `click` 依存から `pointerdown` 主体へ切替（click は重複防止付きフォールバック）
- [x] openNativeViewSettingsFromItemMenu の開始/結果/Notice分岐ログを追加
- [x] hidden時に native toolbar を恒久ON化する処理を追加
- [x] hidden解除後にネイティブツールバー座標安定待ちを追加
- [x] 3点ボタンの `title` 属性を除去（ツールチップ重複回避）
- [x] `nativeViewSettingsBridge` の段階ログを追加
- [x] hidden時メニュー再配置/遅延復元ロジックを撤回
- [x] `AIdocs/LOG-20260217.md` / `AIdocs/IMPLEMENTATION.md` を更新

## 受け入れ条件
- 3点ボタンクリックでコンソールに「クリック検知」ログが出る。
- ブリッジの各段階で成功/失敗理由がログで追跡できる。
- ネイティブツールバー非表示状態でも、3点から設定起動時に表示ON化される（以後手動でOFFに戻せる）。
