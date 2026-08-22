---
paths:
  - "examples/*/metro.config.js"
  - "adapters/svelte/**"
---

# Svelte HMR needs `unstable_forceFullRefreshPatterns`, not react-refresh's default heuristic

A compiled `.svelte` component is a plain capitalized function - react-refresh's
shape-only heuristic (`isLikelyComponentType`) misreads it as a React component and
tries to hot-patch a Fiber tree that doesn't exist here, so the update is silently
swallowed (no error, no reload). Every example's `metro.config.js` must set
`resolver.unstable_forceFullRefreshPatterns: [/\.svelte$/]` to force a real
`DevSettings.reload()` instead. Full mechanism and verification: `svelte-adapter-dom-shim`
skill §28.
