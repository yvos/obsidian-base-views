# Base Views for Obsidian (Experimental)

Base Views は、Obsidian の `.base` ファイル向けにビュー操作を強化する実験的プラグインです。

![Base Views plugin screenshot](assets/readme/BaseViewScreenshot.png)

## 主な機能

※本プラグインは TaskNotes プラグインの fork をベースにしています。以下の`Table View (Custom)` と `Task List View (Custom)` は、TaskNotes の Bases カスタムビュー（Task List View）をベースに拡張しています。

- `.base` ファイルの Viewを常に一覧表示（View一覧。Base Viewsのプラグイン名はこれを表しているつもりです）
- `Table View (Custom)` Basesオリジナルのテーブルビューを模したものに、複数の値を持つプロパティでGroupingした際、それぞれの値のグループにファイルが表示される機能を追加したもの。また、TaskNotesプラグインのカスタムビューTask List Viewの機能である、2段階のグルーピングを移植しています。
- `Task List View (Custom)` TaskNotes プラグインのカスタムビュー Task List Viewをベースに、同じく複数の値を持つプロパティでGroupingした際のunnest機能を追加したもの。

## 注意事項

- 実験的プラグインです。動作上のバグが残っている可能性があります。挙動や設定項目は今後変更される可能性があります。Obsidian側の変更により機能しなくなる可能性があります。
- Obsidian の Bases 機能に依存します。
- Task List View（Custom）は TaskNotes プラグインがインストールされ、有効である時にのみフル機能になります。 TaskNotes プラグインを使用していない場合は、設定から Task List View(Custom)をオフにすることを推奨します。
- View一覧からbaseファイルの個別の設定を変更したとき、一部設定がbaseファイルのformulaに書き込まれます。また、viewごとのdescriptionまたはcolorを設定すると、各viewのセクションにBasesの仕様にないdescription/bg-colorプロパティとして書き込まれます。とりあえずの動作に支障はないですが、仕様外なので何らかの処理と干渉する可能性が否定できません。

## インストール（Obsidian BRAT）

Obsidian BRAT プラグインを用いて導入してください。

1. BRAT をインストールして有効化します。
1. BRAT の設定画面で **Add beta plugin** を選択します。
1. リポジトリURLとして `https://github.com/iiz00/obsidian-base-views` を入力します。
1. 追加後、**Settings → Community plugins** で **Base Views** を有効化します。

## 使い方

設定画面の上部でこれら 3 つの機能を個別にオン/オフできます。使用しない機能はオフにすることをお勧めします。

### View 一覧

- `.base` ファイルでビュー一覧をクリックしてビューを切り替えできます。
- 配置（left / top / none / formulaOnly）、フォントサイズ、アイコン表示、狭幅時挙動を設定できます。
- ビューが複数ある `.base` ファイルでのみ有効になります。

### Table View (Custom)

- Bases のビュータイプとして `Table View (Custom)` を選択できます。BasesオリジナルのTable Viewの動作を模したものです。
- 行の高さ（`Row height`）の設定、列のリサイズ、列のサマリー（`sum` / `avg` / `earliest` など）をサポートします。
- リスト型のプロパティを元にGroup byを設定した場合、それぞれの項目に表示されます。
- viewの設定から、2段階目のGroup byを設定できます(TaskNotesプラグインの機能です)
- `Iconic` プラグインがある場合、ファイル名列にアイコンを表示できます（設定でON/OFF）。

### Task List View (Custom)

- Bases のビュータイプとして `Task List View (Custom)` を選択できます。
- `Sub-group by` と `Unnest multi-value groups` を設定できます。
- TaskNotes ランタイムが有効な場合は編集系操作を利用できます。
- TaskNotes ランタイムが無効な場合は read-only 表示になります。

## 設定項目（概要）

- Feature switches
    - 各機能のオン/オフ切り替え
    - Enable view list sidebar
    - Enable Table View (Custom)
    - Enable Task List View (Custom)
- Interface language（en / ja）
- View list sidebar settings
    - 配置（left / top / none / formulaOnly）、サイドペイン配置（left / top / none / formulaOnly）、フォントサイズ、説明表示、アイコン表示
    - Top overflow（wrap / scroll）
    - 狭幅時挙動、しきい値、ネイティブツールバーの表示制御
- Custom views settings
    - Table View (Custom) の Iconic アイコン表示
    - グルーピング時のプロパティ名表示

## View 一覧の表示位置設定と持続性

View 一覧の表示位置（left / top / none）は、以下の 3 つの経路で設定でき、それぞれ持続性が異なります。

### 1. プラグイン設定（グローバル既定値）

- **Settings → Base Views** で設定する既定の配置です。
- すべての `.base` ファイルに共通で適用されます。
- 個別設定がない場合のフォールバックとして使われます。

### 2. その場かぎりの設定（一時）

- View 一覧のコンテキストメニュー（`Show on left` / `Show on top`）、ツールバーの「Open view list」アイコン、閉じるボタンなどから変更できます。
- メモリ上にのみ保持されるため、タブを閉じたりプラグインを再読み込みすると元に戻ります。

### 3. base ファイルへの埋め込み設定（持続）

- View 一覧のコンテキストメニューから `Always show on left for this base` などの項目を選ぶと、`.base` ファイルの formula に設定が書き込まれます。
- ファイルに保存されるため、再起動後も維持されます。
- 同じ項目を再度選択すると解除され、プラグイン設定のフォールバックに戻ります。

### 優先順位

設定が競合する場合、**その場かぎりの設定 → base ファイル埋め込み設定 → プラグイン設定** の順に優先されます。

## プライバシー / データ取り扱い

- Base Views の機能（ビュー一覧表示、カスタムビュー描画、設定保存）は、基本的にローカルの Obsidian Vault 内で完結します。
- Base Views 本体は、ユーザーデータの収集・送信・テレメトリを目的とした処理を行いません。
- ただし `Task List View (Custom)` で TaskNotes ランタイム連携を使う場合、TaskNotes 側で有効化された機能の挙動は TaskNotes のポリシーに従います。
- 詳細は [PRIVACY.md](PRIVACY.md) を参照してください（適用範囲は今後明確化予定）。

## クレジット

- Based on TaskNotes: https://github.com/callumalpass/tasknotes
- このプラグインには、TaskNotes をベースにした改変コードが含まれます。

## ライセンス

- MIT
