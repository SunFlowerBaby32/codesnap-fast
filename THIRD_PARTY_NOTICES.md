# Third-party notices

## CodeSnap 1.3.4

- Upstream: https://github.com/kufii/CodeSnap
- Original publisher: `adpyke`; upstream author: Adrien Pyke and contributors.
- License: MIT, as declared in the upstream `package.json`.
- Files derived from the installed 1.3.4 distribution: `src/`, `webview/`, and the base extension settings.
- This is an independently maintained fork, not an official CodeSnap release or endorsement.

CodeSnap Fast changes extension identifiers, the clipboard transport and its validation, rendering hot paths, diagnostics, packaging, documentation and tests. Original CodeSnap attribution is retained in `LICENSE`.

## dom-to-image-even-more 1.0.4

- Upstream: https://github.com/kufii/dom-to-image-even-more
- License: MIT; the original notice is preserved verbatim in `vendor/LICENSE`.
- Vendored source: `vendor/dom-to-image-more.js`.
- Local modifications: omit redundant VS Code CSS variables from computed-style snapshots and use guarded inline-token styling, retaining the full copying path for unfamiliar markup.

The readable renderer source is committed directly; installing development dependencies does not overwrite the rendering fixes. No patched `node_modules` tree is required.

CodeSnap itself credits Polacode for the initial concept and Carbon for visual inspiration. All names remain the property of their respective owners.
