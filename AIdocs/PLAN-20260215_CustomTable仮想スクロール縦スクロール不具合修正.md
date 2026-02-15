# PLAN-20260215 CustomTable仮想スクロール縦スクロール不具合修正

## 目的
`tasknotesCustomTable` の仮想スクロール時に、実データ件数が多くてもスクロール領域が約1.5画面分に縮む問題を修正する。

## 原因仮説
- `.tn-bases-table-wrapper` の `overflow-y: hidden` が、仮想スクロール内部の高さ（spacer）を外側スクロール領域へ反映させない。
- その結果、可視行（数十件）分しかスクロール高さにならない。

## 実装タスク
- [x] `styles/bases-views.css` で仮想テーブル時のみ `overflow-y` を適切に上書きし、縦スクロール高さが正しく反映されるようにする
- [x] Obsidian CLI で再計測し、`scrollHeight` が大きくなることを確認する
- [x] `AIdocs/LOG-20260215.md` へ実装内容と判断理由を記録する
- [x] `AIdocs/IMPLEMENTATION.md` に既知挙動の注意点を追記する

## 検証結果
- 修正前（CLI計測）:
  - `rows: 39`, `scrollHeight: 1604`, `clientHeight: 1023`
  - `virtual-scroller__spacer.height: 62240px` に対して外側スクロールが伸びていなかった
- 修正後（CLI計測）:
  - `rows: 39`, `scrollHeight: 62279`, `clientHeight: 1023`
  - 可視行数は仮想化仕様どおり少数のまま、縦スクロール範囲は全件分に復旧

## 受け入れ条件
- 1500件規模の結果でも、`tasknotesCustomTable` で縦スクロールが末尾まで可能になる
- grouped/ungrouped の両方で、可視行数に依存せずスクロール可能範囲が確保される
- 既存の横スクロール・ヘッダー表示・summary 表示が崩れない
