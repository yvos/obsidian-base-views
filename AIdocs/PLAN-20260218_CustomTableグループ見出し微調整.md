# CustomTableグループ見出し微調整

## 概要
1. 2段階グルーピング時に、1段目と2段目の見出しフォントサイズへ軽微な差をつける。
2. `Row height = veryShort` 時に、グループ見出し行の高さ（余白）も連動して縮める。

## タスク
1. [x] `styles/bases-views.css` にグループ見出し用フォント変数（primary/secondary）を追加。
2. [x] `tn-bases-table-group-title-row--primary/--secondary` と `tn-bases-table-subgroup-title` に変数適用。
3. [x] `tn-bases-table-row-height-veryShort` でグループ見出し系余白変数を縮小。
4. [x] `AIdocs/LOG-20260218.md` と `AIdocs/IMPLEMENTATION.md` へ反映。
