# Changelog

## 0.1.0 — 2026-10-20

- Independent CodeSnap fork with its own extension ID, command and settings namespace.
- Windows-native PNG and bitmap clipboard transport, with hidden STA helper, acknowledgements, input limits, bounded waits and temporary-file cleanup.
- Browser clipboard fallback for other desktop platforms or explicit opt-out.
- Rendering optimizations committed as readable vendored source, preserving the original 2× PNG scale.
- Cancel the browser's default copy action when handling image copy; prevent duplicate in-flight captures.
- Optional timing display, hidden by default, with visible errors on failure.
- Reproducible VSIX packaging, automated regression checks and third-party notices.
