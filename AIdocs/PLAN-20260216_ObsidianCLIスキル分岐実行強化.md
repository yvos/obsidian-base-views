# PLAN-20260216 ObsidianCLIスキル分岐実行強化

## 目的
`obsidian-cli` Skill を、`LOG-20260214` の 1～12 で定義した運用（環境判定 + 分岐実行）に揃え、WSL から Windows 実行ファイルを扱うケースでも再現可能な手順にする。

## スコープ
- `AIdocs/Obsidian CLIまとめ.md` と `AIdocs/LOG-20260214.md` (1～12) を反映
- `/home/idee/.codex/skills/obsidian-cli/SKILL.md` の改修
- 分岐後の実行パターン（`bash -lc` とフルパス実行）の明示
- `quick_validate.py` による妥当性確認
- `AIdocs/LOG-20260216.md` への追記

## 実装タスク
- [x] 既存Skillとの差分確認
- [x] `SKILL.md` を分岐実行強化版へ更新
- [x] `quick_validate.py` を実行
- [x] LOG追記

## 受け入れ条件
- `SKILL.md` に preflight、分岐、`bash -lc` 実行パターン、ラッパー設定、ロールバックが含まれる
- `quick_validate.py` が `Skill is valid!` を返す
- 変更内容と判断理由が `AIdocs/LOG-20260216.md` に記録される

## 実施結果サマリー
- `AIdocs/Obsidian CLIまとめ.md` と `AIdocs/LOG-20260214.md` (1～12) を再確認し、不足していた実行経路を整理。
- `/home/idee/.codex/skills/obsidian-cli/SKILL.md` に `Rule 1: 実行コンテキスト` を追加し、直接実行失敗時も `bash -lc` を必須再試行するフローへ変更。
- `PATH_MISMATCH` を `SHELL_INIT_GAP` と name resolution不足に分離し、`~/bin/obsidian` ラッパー手順を維持したまま `bash -lc` 基準での確認に統一。
- `INTEROP_OR_SANDBOX_BLOCKED` の判定条件を「現シェル + `bash -lc` + フルパス + Windows系コマンド失敗」に明確化。
- `quick_validate.py /home/idee/.codex/skills/obsidian-cli` の結果は `Skill is valid!`。
