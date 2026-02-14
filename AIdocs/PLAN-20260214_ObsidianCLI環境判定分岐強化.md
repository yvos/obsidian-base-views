# PLAN-20260214 ObsidianCLI環境判定分岐強化

## 目的
`obsidian-cli` スキルに「環境制約の有無を判定し、結果に応じて処理を分岐する」運用フローを組み込む。

## スコープ
- `/home/idee/.codex/skills/obsidian-cli/SKILL.md` の改修
- 事前診断（preflight）と分岐表の明文化
- 失敗時フォールバック（PATH修正、権限再実行、Windows側確認）の明文化
- `AIdocs/LOG-20260214.md` 追記

## 実装タスク
- [x] 改修方針の確定
- [x] SKILL.md を分岐フロー対応へ更新
- [x] quick validate 実行
- [x] LOG 追記

## 受け入れ条件
- スキル文書内に preflight 判定手順がある
- 判定結果ごとの分岐（成功/PATH問題/WSL制約/未インストール）が明確
- 破壊的コマンド時の確認ルールが明記される
