# Obsidian community plugin

## Language

特に必要がない限り、チャットは日本語で行うこと。
コード内のコメントや文字列の言語は、特にAIdocs/SPEC.mdで指定がない限り既存のコメントや文字列に従うこと。

## Project overview

- Target: Obsidian Community Plugin (TypeScript → bundled JavaScript).
- Entry point: `main.ts` compiled to `main.js` and loaded by Obsidian.
- Required release artifacts: `main.js`, `manifest.json`, and optional `styles.css`.

## Environment & tooling

- Node.js: use current LTS (Node 18+ recommended).
- **Package manager: npm** (required for this sample - `package.json` defines npm scripts and dependencies).
- **Bundler: esbuild** (required for this sample - `esbuild.config.mjs` and build scripts depend on it). Alternative bundlers like Rollup or webpack are acceptable for other projects if they bundle all external dependencies into `main.js`.
- Types: `obsidian` type definitions.

**Note**: This sample project has specific technical dependencies on npm and esbuild. If you're creating a plugin from scratch, you can choose different tools, but you'll need to replace the build configuration accordingly.

### Install

```bash
npm install
```

### Dev (watch)

```bash
npm run dev
```

### Production build

```bash
npm run build
```

## Linting

- To use eslint install eslint from terminal: `npm install -g eslint`
- To use eslint to analyze this project use this command: `eslint main.ts`
- eslint will then create a report with suggestions for code improvement by file and line number.
- If your source code is in a folder, such as `src`, you can use eslint with this command to analyze all files in that folder: `eslint ./src/`

## File & folder conventions

- **Organize code into multiple files**: Split functionality across separate modules rather than putting everything in `main.ts`.
- Source lives in `src/`. Keep `main.ts` small and focused on plugin lifecycle (loading, unloading, registering commands).
- **Example file structure**:
    ```
    src/
      main.ts           # Plugin entry point, lifecycle management
      settings.ts       # Settings interface and defaults
      commands/         # Command implementations
        command1.ts
        command2.ts
      ui/              # UI components, modals, views
        modal.ts
        view.ts
      utils/           # Utility functions, helpers
        helpers.ts
        constants.ts
      types.ts         # TypeScript interfaces and types
    ```
- **Do not commit build artifacts**: Never commit `node_modules/`, `main.js`, or other generated files to version control.
- Keep the plugin small. Avoid large dependencies. Prefer browser-compatible packages.
- Generated output should be placed at the plugin root or `dist/` depending on your build setup. Release artifacts must end up at the top level of the plugin folder in the vault (`main.js`, `manifest.json`, `styles.css`).

## Manifest rules (`manifest.json`)

- Must include (non-exhaustive):
    - `id` (plugin ID; for local dev it should match the folder name)
    - `name`
    - `version` (Semantic Versioning `x.y.z`)
    - `minAppVersion`
    - `description`
    - `isDesktopOnly` (boolean)
    - Optional: `author`, `authorUrl`, `fundingUrl` (string or map)
- Never change `id` after release. Treat it as stable API.
- Keep `minAppVersion` accurate when using newer APIs.
- Canonical requirements are coded here: https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml

## Testing

- Manual install for testing: copy `main.js`, `manifest.json`, `styles.css` (if any) to:
    ```
    <Vault>/.obsidian/plugins/<plugin-id>/
    ```
- Reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Commands & settings

- Any user-facing commands should be added via `this.addCommand(...)`.
- If the plugin has configuration, provide a settings tab and sensible defaults.
- Persist settings using `this.loadData()` / `this.saveData()`.
- Use stable command IDs; avoid renaming once released.

## Versioning & releases

- Bump `version` in `manifest.json` (SemVer) and update `versions.json` to map plugin version → minimum app version.
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json`, `main.js`, and `styles.css` (if present) to the release as individual assets.
- After the initial release, follow the process to add/update your plugin in the community catalog as required.

## Security, privacy, and compliance

Follow Obsidian's **Developer Policies** and **Plugin Guidelines**. In particular:

- Default to local/offline operation. Only make network requests when essential to the feature.
- No hidden telemetry. If you collect optional analytics or call third-party services, require explicit opt-in and document clearly in `README.md` and in settings.
- Never execute remote code, fetch and eval scripts, or auto-update plugin code outside of normal releases.
- Minimize scope: read/write only what's necessary inside the vault. Do not access files outside the vault.
- Clearly disclose any external services used, data sent, and risks.
- Respect user privacy. Do not collect vault contents, filenames, or personal information unless absolutely necessary and explicitly consented.
- Avoid deceptive patterns, ads, or spammy notifications.
- Register and clean up all DOM, app, and interval listeners using the provided `register*` helpers so the plugin unloads safely.

## UX & copy guidelines (for UI text, commands, settings)

- Prefer sentence case for headings, buttons, and titles.
- Use clear, action-oriented imperatives in step-by-step copy.
- Use **bold** to indicate literal UI labels. Prefer "select" for interactions.
- Use arrow notation for navigation: **Settings → Community plugins**.
- Keep in-app strings short, consistent, and free of jargon.

## Performance

- Keep startup light. Defer heavy work until needed.
- Avoid long-running tasks during `onload`; use lazy initialization.
- Batch disk access and avoid excessive vault scans.
- Debounce/throttle expensive operations in response to file system events.

## Coding conventions

- TypeScript with `"strict": true` preferred.
- **Keep `main.ts` minimal**: Focus only on plugin lifecycle (onload, onunload, addCommand calls). Delegate all feature logic to separate modules.
- **Split large files**: If any file exceeds ~200-300 lines, consider breaking it into smaller, focused modules.
- **Use clear module boundaries**: Each file should have a single, well-defined responsibility.
- Bundle everything into `main.js` (no unbundled runtime deps).
- Avoid Node/Electron APIs if you want mobile compatibility; set `isDesktopOnly` accordingly.
- Prefer `async/await` over promise chains; handle errors gracefully.

## Mobile

- Where feasible, test on iOS and Android.
- Don't assume desktop-only behavior unless `isDesktopOnly` is `true`.
- Avoid large in-memory structures; be mindful of memory and storage constraints.

## Agent do/don't

**Do**

- Add commands with stable IDs (don't rename once released).
- Provide defaults and validation in settings.
- Write idempotent code paths so reload/unload doesn't leak listeners or intervals.
- Use `this.register*` helpers for everything that needs cleanup.

**Don't**

- Introduce network calls without an obvious user-facing reason and documentation.
- Ship features that require cloud services without clear disclosure and explicit opt-in.
- Store or transmit vault contents unless essential and consented.

## Common tasks

### Organize code across multiple files

**main.ts** (minimal, lifecycle only):

```ts
import { Plugin } from "obsidian";
import { MySettings, DEFAULT_SETTINGS } from "./settings";
import { registerCommands } from "./commands";

export default class MyPlugin extends Plugin {
	settings: MySettings;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		registerCommands(this);
	}
}
```

**settings.ts**:

```ts
export interface MySettings {
	enabled: boolean;
	apiKey: string;
}

export const DEFAULT_SETTINGS: MySettings = {
	enabled: true,
	apiKey: "",
};
```

**commands/index.ts**:

```ts
import { Plugin } from "obsidian";
import { doSomething } from "./my-command";

export function registerCommands(plugin: Plugin) {
	plugin.addCommand({
		id: "do-something",
		name: "Do something",
		callback: () => doSomething(plugin),
	});
}
```

### Add a command

```ts
this.addCommand({
	id: "your-command-id",
	name: "Do the thing",
	callback: () => this.doTheThing(),
});
```

### Persist settings

```ts
interface MySettings { enabled: boolean }
const DEFAULT_SETTINGS: MySettings = { enabled: true };

async onload() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  await this.saveData(this.settings);
}
```

### Register listeners safely

```ts
this.registerEvent(
	this.app.workspace.on("file-open", (f) => {
		/* ... */
	})
);
this.registerDomEvent(window, "resize", () => {
	/* ... */
});
this.registerInterval(
	window.setInterval(() => {
		/* ... */
	}, 1000)
);
```

## Troubleshooting

- Plugin doesn't load after build: ensure `main.js` and `manifest.json` are at the top level of the plugin folder under `<Vault>/.obsidian/plugins/<plugin-id>/`.
- Build issues: if `main.js` is missing, run `npm run build` or `npm run dev` to compile your TypeScript source code.
- Commands not appearing: verify `addCommand` runs after `onload` and IDs are unique.
- Settings not persisting: ensure `loadData`/`saveData` are awaited and you re-render the UI after changes.
- Mobile-only issues: confirm you're not using desktop-only APIs; check `isDesktopOnly` and adjust.

## References

- Obsidian sample plugin: https://github.com/obsidianmd/obsidian-sample-plugin
- API documentation: https://docs.obsidian.md
- Developer policies: https://docs.obsidian.md/Developer+policies
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Style guide: https://help.obsidian.md/style-guide

## Project Documents and Source of Truth

- 既存のリポジトリのフォークの場合は、以下は存在しないこともある。
- `AIdocs/SPEC.md`: リポジトリ全体の概要、最終的な仕様をSPEC.mdにまとめる。プラン作成の際や、その他必要になった際に参照すること。修正が必要だと判断した場合は、直接修正せず、理由と影響範囲を明示した提案を行うこと。明示的な承認が得られた場合のみ、SPEC.md を修正してよい。
- `AIdocs/PLAN-{YYYYMMDD}_改修機能名.md`: 現在のセッションまたは短期スプリントの作業計画を示す（以下PLANファイル）。YYYYMMDDはPLANファイル作成時の日付。改修機能名は実装しようとしている修正内容や新規機能名。.cursor\plansフォルダ内の改修機能名.plan.md形式のファイルをコンテキストとして渡された場合はそちらをPLANファイルとして扱い新規作成は不要。そうでない場合は実装を開始する前に、上記の通りPLANファイルを作成すること。CodexやClaude CodeなどのPLANモードで計画を立てた場合はその内容をそのまま転記する。末尾にTODOリストのセクションを作成して実行予定順にタスクリストを作成し、タスクの進捗状況が分かるようにすること。完了した項目には簡単な結果をつけること。変更したり中止した項目にはその内容と理由を簡単に記すこと。コンテキストとして渡された場合や、そのセッションで作成した場合は常に参照しながら実装を進め、計画や変更やタスクが完了の際はそれにあわせて更新すること。
- `.cursor\plans\プロジェクト名_改修機能名.plan.md`: 前項のPLANファイルと同等に扱い、これがコンテキストとして渡された場合は前項のPLANファイル作成は不要。同じく末尾にTODOリストのセクションを設けること。
- `AIdocs/IMPLEMENTATION.md`: 現在の実装状況をまとめたもの。ファイル構成や、テストについての情報、運用や今後の実装についての注意点や参照情報などを含む。必要に応じて参照すること。ある機能の実装や修正が完了し、実装状態として定着したと判断される場合に更新すること。
  軽微な変更や一時的な試行については LOG に記録し、IMPLEMENTATION.md には反映しない。
- `AIdocs/LOG-{YYYYMMDD}.md` : ある機能の実装や修正が終わるごとに、実装した内容やADRについて、日付つきのログファイルに記録すること。ログには、実装内容だけでなく「なぜそうしたか（判断理由）」を簡潔に含めること。

### AIdocs/IMPLEMENTATION.mdの推奨構成

- 原則以下のようにするが、補うべき項目があれば適宜追加すること。
-   0. この文章の意義、位置づけ: このファイルは現在の実装状況や関連情報をまとめたものである。最終的な仕様を示したSPEC.mdとは区別される。このファイルを最終的な仕様と解釈すべきではない。
- 1.実装状況のサマリー: これまでに実装した内容を1機能1～2行程度で簡潔にまとめる。
- 2.実装済み機能: 実装済みの機能を列挙してまとめる。
- 3.ファイル構造: ファイル/フォルダ構成と各ファイルの簡潔な説明
- 4.データ構造: ファイル横断的に用いられるデータの内容や使用法の解説
- 5.挙動の詳細や注意点: 現在の実装の注意点や癖のある挙動についての情報
- 6.SPECとの差分、ずれ
- 7.未実装な点
- 8.既知の制限
- 9.AI向けの注意点: 参照優先順位、誤解しやすい点、更新時の注意を記載する。将来の実装提案は含めない。

### Obsidian API

#### 公開API

- `AIdocs/obsidian.d.ts`: 型定義（検索用索引として使用）
- **使用規則**:
    - 使用クラスの候補が定まっている場合のみ、プロパティやメソッドの確認のために参照。
    - 通読・網羅的参照は原則禁止。そのように使う場合は承認を得ること。
    - 参照箇所をログに記録すること

#### 非公開/内部API

- `AIdocs/types.d.ts`: 型定義
- **使用規則**:
    - 急な変更・廃止がありうることに注意
    - できる限り公開APIを使い、安易に使用しない。
    - 内部APIを使うときは計画段階で使用APIと目的を提案し、承認を得た場合のみ使用すること
    - 参照箇所をログに記録すること
