# Bases view一覧テキストクリップ改善 + CustomTable unnest重複行ジャンプ機能 実装計画

## 1. 概要
1. 左端表示のview一覧で、長いview名/プロパティが行ボーダー外にはみ出さないように、行枠内でクリップする。  
2. `tasknotesCustomTable` で `unnestMultiValueGroup=true` かつ同一ファイルが複数行に出る場合、`file.name` セル内リンク右に `git-branch` アイコンを表示し、クリックで次の同一ファイル行へ循環ジャンプする。  
3. 3箇所以上ある場合も順次ジャンプし、末尾後は先頭へ戻る。単一出現ファイルにはアイコンを表示しない。  

## 2. 公開API/設定/型への影響
1. 公開API、`manifest.json`、既存コマンド、既存設定項目の変更は行わない。  
2. 内部実装として、CustomTableの重複行ナビゲーション用ユーティリティを新設する。  
3. 既存の `unnestMultiValueGroup` 設定値を表示判定に利用し、追加設定は作らない。  

## 3. 実装方針
### 3.1 view一覧テキストクリップ（左端表示）
1. 対象は `styles/bases-views.css` のview一覧部分のみ。  
2. 左端レイアウト時だけ `button.tn-bases-view-list__item` と `.tn-bases-view-list__item-content` を枠内クリップに寄せる。  
3. `top` レイアウト（wrap/scroll）は既存挙動優先で変更しない。  
4. 3点ボタンは既存配置を維持し、テキスト側のみ縮退/ellipsisを強化する。  

### 3.2 CustomTable 重複行ジャンプ（通常/仮想の共通化）
1. 重複判定は現在描画対象の行順（フィルタ・グループ適用後）を単位にする。  
2. `file.path -> rowOrder[]` の出現マップを毎renderで再構築する。  
3. アイコン表示条件は `unnestMultiValueGroup=true` かつ `rowOrder[]` が2件以上。  
4. ジャンプ先は `rowOrder[]` の次要素、末尾時は先頭（循環）。  

### 3.3 レンダリングモード別到達
1. 非仮想では各行DOMへ `data-tn-row-order` を付与し、`scrollIntoView({ block: "center", behavior: "smooth" })` で移動。  
2. 仮想Ungroupedは `rowOrder === virtualIndex` として `VirtualScroller.scrollToIndex()` を呼ぶ。  
3. 仮想Grouped/Nestedは row要素だけに `rowOrder` を持たせ、`rowOrder -> virtualIndex` の対応表で `scrollToIndex()` する。  
4. 不整合や例外時は no-op とし、通常リンク操作に影響させない。  

### 3.4 `file.name` セルUI
1. `renderFileLink` に `rowOrder` を渡し、必要時のみ `git-branch` ボタンを同一ラッパ内（リンク右）に表示。  
2. ボタンは `type="button"` + `aria-label/title` を設定し、`click` で `preventDefault + stopPropagation`。  
3. 既存のファイルリンク挙動（左クリック/CmdCtrl+クリック/中クリック/右クリック）は維持する。  

## 4. 変更対象ファイル
1. `src/bases/CustomTableView.ts`  
2. `src/bases/customTableDuplicateNavigation.ts`（新規）  
3. `styles/bases-views.css`  
4. `tests/unit/bases/customTableDuplicateNavigation.test.ts`（新規）  
5. `AIdocs/PLAN-20260218_CustomTable重複行ジャンプとView一覧クリップ改善.md`（新規）  
6. `AIdocs/LOG-20260218.md`（更新）  
7. `AIdocs/IMPLEMENTATION.md`（更新）  

## 5. テストケース
1. 左端view一覧で長いview名/プロパティが行ボーダー内でellipsisされる。  
2. top表示のview一覧（wrap/scroll）は既存のオーバーフロー挙動を維持する。  
3. `unnestMultiValueGroup=true` で同一ファイル2件以上のときのみ `git-branch` アイコンを表示する。  
4. 単一出現ファイルにはアイコンを表示しない。  
5. アイコンクリックで次の同一ファイル行へ移動し、末尾から先頭へ循環する。  
6. 仮想描画ON（件数大）でもジャンプが機能する。  
7. 既存リンク操作（通常クリック/CmdCtrl+クリック/中クリック/右クリックメニュー）に回帰がない。  
8. 例外時もrender自体は継続し、CustomTableが壊れない。  

## 6. 前提とデフォルト
1. 「同じファイルの次行」は現在の表示順全体（グループ境界をまたぐ）で判定する。  
2. ジャンプ時のフォーカス移譲は必須にせず、スクロール到達を優先する。  
3. アイコン表示は `unnestMultiValueGroup` 有効時に限定する。  
4. 追加のユーザー設定は導入しない。  
