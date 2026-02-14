# PLAN-20260214 ObsidianCLIスキル化

## 目的
Codex（Cursor機能拡張版）で Obsidian CLI を扱うための再利用可能な Skill を作成する。

## スコープ
- `~/.codex/skills/obsidian-cli` に Skill を新規作成
- SKILL.md に実行環境差分、初期診断、設定、運用、ロールバック手順を定義
- 必要に応じて `agents/openai.yaml` を生成
- 生成した Skill を `quick_validate.py` で検証
- 実施内容を `AIdocs/LOG-20260214.md` に追記

## 実装タスク
- [x] 作成方針と命名の確定（`obsidian-cli`）
- [x] Skill テンプレート初期化
- [x] SKILL.md の実装
- [x] 検証実行（quick validate）
- [x] LOG 追記

## 受け入れ条件
- `obsidian-cli` Skill が作成され、構文検証を通過する
- SKILL に最低限以下が含まれる
  - 環境判定（Windows側とCodex側差分）
  - CLI到達確認コマンド
  - WSL/Codex向け設定手順（`~/bin/obsidian`）
  - ロールバック手順
