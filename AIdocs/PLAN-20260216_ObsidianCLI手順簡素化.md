# PLAN-20260216 ObsidianCLI手順簡素化

## 目的
`obsidian-cli` Skill の実体確認手順を削減し、通常運用での手順を短くする。

## スコープ
- `/home/idee/.codex/skills/obsidian-cli/SKILL.md` の簡素化
- 「通常フロー」と「詳細診断フロー」の2段階構成へ整理
- `quick_validate.py` の実行
- `AIdocs/LOG-20260216.md` 追記

## 実装タスク
- [x] 現行Skillの簡素化方針確定
- [x] `SKILL.md` 更新
- [x] `quick_validate.py` 実行
- [x] LOG追記

## 受け入れ条件
- 通常時の確認コマンド数が減っている
- 詳細診断が「必要時のみ」の位置づけで分離されている
- `quick_validate.py` が `Skill is valid!` を返す

## 実施結果サマリー
- `obsidian-cli` Skill を「通常フロー（Step 1〜4）」と「詳細診断（必要時のみ）」に分離。
- `which/type -a/where/Get-Command` はデフォルト必須から詳細診断へ移動。
- 通常フローは `obsidian help` / `bash -lc` / 実体候補検証 / wrapper更新の最短経路へ整理。
- `quick_validate.py /home/idee/.codex/skills/obsidian-cli` は `Skill is valid!`。
