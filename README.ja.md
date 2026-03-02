# Base Views for Obsidian (Experimental)

Base Views は、Obsidian の `.base` ファイル向けにビュー操作を強化する実験的プラグインです。

## 主な機能

- `.base` ファイルの View list sidebar（ビュー一覧サイドバー）
- `Table View (Custom)`
- `Task List View (Custom)`
- 本プラグインは TaskNotes プラグインの fork をベースにしています。
- `Table View (Custom)` と `Task List View (Custom)` は、TaskNotes の Bases カスタムビュー（Task List View）をベースに拡張しています。

## インストール（Obsidian BRAT）

このプラグインは現在 Community Plugins への申請予定はなく、BRAT 経由の導入を想定しています。

1. BRAT をインストールして有効化します。
1. BRAT の設定画面で **Add beta plugin** を選択します。
1. リポジトリを指定します（例: `https://github.com/<owner>/<repo>` または `<owner>/<repo>`）。
1. 追加後、**Settings → Community plugins** で **Base Views** を有効化します。

## 使い方

### View list sidebar

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
- 詳細は [PRIVACY.md](PRIVACY.md) を参照してください（適用範囲は今後明確化予定）。

## 注意事項

- 実験的プラグインです。挙動や設定項目は今後変更される可能性があります。
- Obsidian の Bases 機能に依存します。
- 一部機能は TaskNotes ランタイム有効時にのみフル機能になります。

## クレジット

- Based on TaskNotes: https://github.com/calluma/tasknotes
- このプラグインには、TaskNotes をベースにした改変コードが含まれます。

## ライセンス

- MIT
- TaskNotes 由来部分も MIT ライセンスに従います。
