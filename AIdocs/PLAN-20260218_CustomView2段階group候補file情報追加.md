# CustomView 2段階Group候補に file系7種を追加（2026-02-18）

## 概要
- 対象は `tasknotesCustomTable` の `subGroup` 候補のみ。
- `file.*` のうち、次の7種を候補として許可する。
  - `file.folder`
  - `file.ext`
  - `file.size`
  - `file.links`
  - `file.backlinks`
  - `file.embeds`
  - `file.tags`
- `tasknotesTaskList` の `subGroup` 候補は今回変更しない。

## 実装方針
1. `src/bases/registration.ts` で CustomTable 向け `subGroup` filter のみ拡張。
2. 可読性のため `Set` + ヘルパー関数で許可条件を明示。
3. `TaskListView` 側ロジック・型には手を入れない。

## 変更対象
- `src/bases/registration.ts`
- `tests/unit/bases/registration.customTableOptions.test.ts`
- `AIdocs/LOG-20260218.md`
- `AIdocs/IMPLEMENTATION.md`

## テスト観点
1. CustomTable の `subGroup` filter が7種を許可する。
2. 非対象 `file.*`（例: `file.name`, `file.path`, `file.ctime`）は不許可。
3. 既存の `note.*` / `task.*` / `formula.*` 許可が維持される。
4. 既存 `rowHeight` option の回帰がない。
