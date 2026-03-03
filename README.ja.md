# Base Views for Obsidian (Experimental)

Base Views は、Obsidian の `.base` ファイル向けにビュー操作を強化する実験的プラグインです。

![Base Views プラグインのスクリーンショット](assets/readme/BaseViewScreenshot.png)

## 主な機能

※本プラグインは TaskNotes プラグインの fork をベースにしています。以下の`Table View (Custom)` と `Task List View (Custom)` は、TaskNotes の Bases カスタムビュー（Task List View）をベースに拡張しています。
- `.base` ファイルの Viewを常に一覧表示（View一覧。Base Viewsのプラグイン名はこれを表しているつもりです）
- `Table View (Custom)` Basesオリジナルのテーブルビューに、複数の値を持つプロパティでGroupingした際、それぞれの値のグループにファイルが表示される機能を追加したもの。また、TaskNotesプラグインのカスタムビューTask List Viewの機能である、2段階のグルーピングを移植しています。
- `Task List View (Custom)` TaskNotes プラグインのカスタムビュー Task List Viewに、同じく複数の値を持つプロパティでGroupingした際のunnest機能を追加したもの。

## 注意事項

- 実験的プラグインです。挙動や設定項目は今後変更される可能性があります。Obsidian側の変更により機能しなくなる可能性があります。
- Obsidian の Bases 機能に依存します。
- Task List View（Custom）は TaskNotes プラグインがインストールされ、有効である時にのみフル機能になります。 TaskNotes プラグインを使用していない場合は、設定から Task List View(Custom)をオフにすることを推奨します。
- View一覧からbaseファイルの個別の設定を変更したとき、一部設定がbaseファイルのformulaに書き込まれます。また、viewごとのdescriptionを設定すると、各viewのセクションにBasesの仕様にないdescriptionプロパティとして書き込まれます。

## インストール（Obsidian BRAT）

Obsidian BRAT プラグインを用いて導入してください。

1. BRAT をインストールして有効化します。
1. BRAT の設定画面で **Add beta plugin** を選択します。
1. リポジトリを指定します（https://github.com/iiz00/obsidian-base-views）。
1. 追加後、**Settings → Community plugins** で **Base Views** を有効化します。

## 使い方
設定のトップで、以下の3つの機能をオンオフできるので、使わない機能はオフにしてください。
### View 一覧

- `.base` ファイルでビュー一覧をクリックしてビューを切り替えできます。
- 配置（left / top / none）、フォントサイズ、アイコン表示、狭幅時挙動を設定できます。
- ビューが複数ある `.base` ファイルで特に有効です。

### Task List View (Custom)

- Bases のビュータイプとして `Task List View (Custom)` を選択できます。
- `Sub-group by` と `Unnest multi-value groups` を設定できます。
- TaskNotes ランタイムが有効な場合は編集系操作を利用できます。
- TaskNotes ランタイムが無効な場合は read-only 表示になります。

### Table View (Custom)

- Bases のビュータイプとして `Table View (Custom)` を選択できます。
- 行高（Row height）、Sub-group、Unnest を設定できます。
- 列幅調整、列サマリー（sum / avg / earliest など）、グループ表示に対応します。
- `Iconic` プラグインがある場合、ファイル名列にアイコンを表示できます（設定でON/OFF）。

## 設定項目（概要）

- Feature switches
    - 各主要機能のオンオフ
    - Enable view list sidebar
    - Enable Table View (Custom)
    - Enable Task List View (Custom)
- Interface language（en / ja）
- View list sidebar settings
    - 配置、サイドペイン配置、フォントサイズ、説明表示、アイコン表示
    - Top overflow（wrap / scroll）
    - 狭幅時挙動、しきい値、ネイティブツールバーの表示制御
- Custom views settings
    - Table View (Custom) の Iconic アイコン表示
    - グルーピング時のプロパティ名表示

## プライバシー / データ取り扱い

- Base Views の機能（ビュー一覧表示、カスタムビュー描画、設定保存）は、基本的にローカルの Obsidian Vault 内で完結します。
- Base Views 本体は、ユーザーデータの収集・送信・テレメトリを目的とした処理を行いません。
- ただし `Task List View (Custom)` で TaskNotes ランタイム連携を使う場合、TaskNotes 側で有効化された機能の挙動は TaskNotes のポリシーに従います。

## クレジット

- Based on TaskNotes: https://github.com/calluma/tasknotes
- このプラグインには、TaskNotes をベースにした改変コードが含まれます。

## ライセンス

- MIT

