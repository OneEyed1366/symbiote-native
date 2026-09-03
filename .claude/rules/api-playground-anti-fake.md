---
paths:
  - "examples/*/screens/ApiPlaygroundScreen.*"
  - "examples/*/components/*playground*/**"
  - ".docs/framework-api-surface/*.md"
---

# API Playground screens — never fake a missing API, fix or disclose it

Building/extending an "API Playground" demo screen (or its checklist)? Invoke the
`symbiote-api-playground` skill first — it has the full 4-step process and the concrete
`withModifiers` incident that motivates this rule.

Core rule, no exceptions: if a framework API doesn't work under the adapter, there are exactly
two acceptable outcomes — (a) a genuine CLEAN SHIM at the adapter/core level (pure JS/TS logic on
objects the adapter already exposes, zero native/Fabric/engine changes), or (b) an HONESTLY
DOCUMENTED gap, visible in the screen's own UI/comment, never silently faked with a local
reimplementation that merely LOOKS like it passes. After any adapter fix, re-pack + reinstall
every consuming example app (`rm -rf node_modules/@symbiote-native/<fw> && rm -f package-lock.json
&& npm install`) before trusting its typecheck/lint — a stale `file:` tarball reports success
against old bytes with no warning.
