---
---

No release. The change is inside `core/engine/cpp/tests/`, which the engine's own
`files` field excludes from the tarball (`"cpp", "!cpp/tests"`), so nothing a
consumer installs moves. It only lets the host test build link JavaScriptCore off
macOS, where WebKitGTK provides the same C API.
