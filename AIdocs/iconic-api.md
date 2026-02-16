# Iconic plugin API memo (unofficial)

This note summarizes the current, unofficial API described by the Iconic author.
It may change without notice, so wrap calls defensively and treat failures as
non-fatal.

## How to set an icon on a file

The Iconic plugin exposes an internal method that can be called like this:

```ts
const iconic = app.plugins.getPlugin("iconic");
if (iconic && typeof iconic.saveFileIcon === "function") {
  // object.id is the vault-relative path to the file.
  await iconic.saveFileIcon({ id: "Relative/Path/To/Your/File.md" }, icon, color);
  if (typeof iconic.refreshIconManagers === "function") {
    iconic.refreshIconManagers();
  }
}
```

Parameters:
- `object`: must include `id` with the vault-relative path (e.g. `"Notes/Today.md"`).
- `icon`: string icon ID or emoji, or `null` to clear.
- `color`: string color name or hex (e.g. `red`, `#ffcc00`), or `null` to clear.

## Notes

- This is not a public/stable API. Check for existence before calling and do
  not hard-fail if the plugin is missing or changes.
- After setting an icon, call `refreshIconManagers()` to update the UI.
