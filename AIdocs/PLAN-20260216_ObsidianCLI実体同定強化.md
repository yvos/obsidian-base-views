# PLAN-20260216 ObsidianCLI実体同定強化

## 目的
`obsidian-cli` Skill を更新し、実行前に「現在叩いている obsidian の実体」を確定してから分岐できるようにする。

## スコープ
- `/home/idee/.codex/skills/obsidian-cli/SKILL.md` の改修
- WSL側 `which` / `type -a`、Windows側 `where` / `Get-Command` の手順明示
- 複数 `Obsidian.com` 候補を `help` で検証し、成功実体を選ぶ手順追加
- wrapper の参照先更新手順追加
- `quick_validate.py` 実行
- `AIdocs/LOG-20260216.md` 追記

## 実装タスク
- [x] 現Skillとの差分設計
- [x] `SKILL.md` 更新
- [x] `quick_validate.py` 実行
- [x] LOG追記

## 受け入れ条件
- Skill内で「今叩いている obsidian の正体」を判定できる
- 成功する `Obsidian.com` 実体を自動選定する手順がある
- `quick_validate.py` が `Skill is valid!` を返す

## 実施結果サマリー
- `obsidian-cli` Skill に `Rule 1`（`which/type -a` + `where/Get-Command`）を追加し、実体同定を必須化。
- `Rule 2` として `Obsidian.com` 複数候補の `help` exit code 検証フローを追加。
- `WRAPPER_TARGET_STALE` 分岐を追加し、wrapper が古い実体を指しているケースを補正可能にした。
- `WINDOWS_COMMAND_NOT_FOUND` 分岐を追加し、Windows PATH 未登録でもフルパス実行で運用継続できるよう明記。
- `quick_validate.py /home/idee/.codex/skills/obsidian-cli` は `Skill is valid!`。
