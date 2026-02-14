# Obsidian CLIまとめ（Codex / Cursor機能拡張版）

## 1. この文書の目的
この文書は、Codex（Cursor機能拡張版）で Obsidian CLI を使うときに必要な環境と設定をまとめたものです。  
特に、次の点を初心者向けに整理しています。

- どの環境なら動くか
- どの環境だと動かないか
- 実際に行った設定内容
- 実際に作成したスクリプト
- 使い方
- 元に戻す手順

## 2. まず結論
今回の検証で分かった最重要ポイントは次のとおりです。

- Windows 11 の通常ターミナル（PowerShell/cmd）と、Codex の実行シェル（bash）は別環境です。
- そのため、Windows 側で `obsidian` が動いても、Codex 側では最初 `obsidian: command not found` になります。
- 原因は多くの場合、`PATH`（コマンド探索先）の差です。
- Codex 側で使えるようにするには、WSL/bash 側で `obsidian` を解決できる設定が必要です。
- 今回は `~/bin/obsidian` ラッパースクリプトを作ることで、永続的に利用可能な状態にしました。

## 3. 今回の検証環境
本セッションで確認した環境は次のとおりです。

- ホストOS: Windows 11
- Obsidian CLI 実体:
  - `C:\Users\idee\AppData\Local\Obsidian\Obsidian.com`
  - `C:\Users\idee\AppData\Local\Obsidian\Obsidian.exe`
- Codex 側シェル: `/bin/bash`（Linux側環境）
- Linux側から見える Obsidian 実体パス:
  - `/mnt/c/Users/idee/AppData/Local/Obsidian/Obsidian.com`

## 4. 必要環境（動作に必要な条件）
Codex から Obsidian CLI を使うには、少なくとも次が必要です。

1. Windows 側に Obsidian がインストールされていること
1. 実体ファイル（`Obsidian.com` か `Obsidian.exe`）の場所が分かること
1. Linux/bash 側から Windows ドライブ（`/mnt/c/...`）にアクセスできること
1. bash 側で `obsidian` というコマンド名を解決できること（PATHまたはラッパー設定）

補足:
- `PATH` は「コマンド名だけ入力したときに、どこを探すか」を決める環境変数です。
- ここが揃っていないと、CLI自体は存在していても `command not found` になります。

## 5. 動かない環境・失敗しやすい環境
今回、実際に失敗したパターンは次のとおりです。

1. Codex の bash で `obsidian help` をそのまま実行
1. `cmd.exe /c obsidian help` / `powershell.exe ...` を Codex 側から実行
1. 設定後でも、プロファイルを読み込まないシェルで `obsidian` を直接実行

主な理由:

1. Windows ターミナルと Codex/bash で `PATH` が一致しない
1. セッション起動タイミングの差で、インストール後の環境変数が反映されない
1. 実行コンテキスト（サンドボックス・シェル種別）の違いで Windows 実行ファイル呼び出しが失敗する場合がある

## 6. 今回行った設定
今回、以下を設定しました。

### 6.1 `~/.bashrc` への追記
以下の2つを追加しました。

```bash
# Obsidian CLI shortcut for WSL sessions
alias obsidian="/mnt/c/Users/idee/AppData/Local/Obsidian/Obsidian.com"

# Obsidian CLI wrapper (works in non-interactive shells too)
obsidian() {
  /mnt/c/Users/idee/AppData/Local/Obsidian/Obsidian.com "$@"
}
```

意図:

- `alias`: 対話シェルで短縮呼び出しをしやすくするため
- 関数: 引数を安全に渡すため

注意:
- `.bashrc` は構成によっては「対話シェルでのみ」有効です。

### 6.2 `~/bin/obsidian` ラッパースクリプトの作成（実運用の本命）
次のファイルを作成しました。

- パス: `~/bin/obsidian`
- 内容:

```bash
#!/usr/bin/env bash
exec /mnt/c/Users/idee/AppData/Local/Obsidian/Obsidian.com "$@"
```

この方法を本命にした理由:

- `~/.profile` で `~/bin` を PATH に入れる設定が既に存在していたため
- Cursor/PC再起動後も有効になりやすいため
- `obsidian` という短いコマンド名で扱えるため

## 7. 作成したスクリプトの使用方法
### 7.1 まず確認
新しいシェルを開いて、次を実行します。

```bash
command -v obsidian
```

期待値:

- `/home/idee/bin/obsidian` が表示される

### 7.2 ヘルプ表示

```bash
obsidian help
```

表示例（先頭）:

- `Obsidian CLI`
- `Usage: obsidian <command> [options]`

### 7.3 よく使う実行例

```bash
obsidian help
obsidian version
obsidian vault=Notes commands
```

## 8. 要件と制限の整理
### 8.1 要件

1. Obsidian の実体パスが有効であること
1. そのパスが Linux 側から到達可能であること
1. `obsidian` 名で呼ぶための PATH またはラッパー設定があること

### 8.2 制限

1. Codex の実行環境では、Windows 実行ファイル呼び出しに制約が出る場合がある
1. シェルの種類（対話/非対話、ログイン/非ログイン）で設定反映が変わる
1. Windows 側で CLI が動いても、Codex 側では同じ結果にならないことがある

## 9. 環境を元に戻す手順（ロールバック）
次の順で戻せます。

1. `~/bin/obsidian` を削除
1. `~/.bashrc` に追加した `alias obsidian=...` と `obsidian() { ... }` を削除
1. シェルを再起動（または新規ターミナルを開く）
1. `command -v obsidian` で解決されないことを確認

例:

```bash
rm -f ~/bin/obsidian
# ~/.bashrc から追記ブロックを削除
```

## 10. トラブルシューティング（再確認用）
Windows 側（通常ターミナル）で確認:

```powershell
where.exe obsidian
Get-Command obsidian | Format-List Source,Definition
```

Linux/Codex 側で確認:

```bash
command -v obsidian
echo "$PATH"
```

補足:
- もし `obsidian` が見つからない場合は、`~/bin` が PATH に入っているか確認してください。
- それでも動かない場合は、`/mnt/c/Users/idee/AppData/Local/Obsidian/Obsidian.com help` の直接実行で切り分けできます。

## 11. 永続性について
今回の `~/bin/obsidian` 方式は、ホームディレクトリが保持される限り永続です。  
そのため、通常は次の再起動後も有効です。

1. Cursor の再起動
1. PC の再起動

ただし、次の場合は再設定が必要です。

1. Obsidian のインストール先が変更された
1. `~/bin` や `~/.profile` / `~/.bashrc` を手動変更した
