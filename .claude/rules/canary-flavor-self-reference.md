---
paths:
  - "examples/*/screens/**"
  - "examples/*/src/screens/**"
  - "examples/*/components/**"
  - "examples/*/src/components/**"
---

# A canary references its OWN framework, never React Native

Every example app is the canary for one framework, so each user-visible URL,
button label, image asset and `alt` text names THAT framework — not the one
the file was ported from. The canaries are ports of each other, so a
`reactnative.dev` left behind is the default failure mode, not a rare one:
as of 2026-08-15 `examples/vue-sfc` still had every single one of them
(share URL, `Linking.openURL`, the "Open reactnative.dev" button label, both
logo images, and `NativeModulesDemo`'s `LOGO_URI`/`PREFETCH_URI`), while
`vue-tsx` had flavoured the images but not the link.

| flavor | site | logo asset |
| --- | --- | --- |
| react | `reactnative.dev` | `reactnative.dev/img/tiny_logo.png` |
| vue-tsx · vue-sfc | `vuejs.org` | `vuejs.org/images/logo.png` |
| svelte | `svelte.com` | `svelte.dev/favicon.png` |
| angular | `angular.dev` | `angular.io/assets/images/logos/angular/angular.png` |

The prefetch demo appends `?warm=symbiote` to the same asset (a distinct cache
key, same bytes). After porting a screen between flavors, sweep for the source
flavor's domain across the WHOLE example, `components/` included — the screen
file is not the only place it hides:

```
grep -rn "reactnative\.dev" examples/<flavor> --include="*.ts" --include="*.tsx" \
  --include="*.vue" --include="*.svelte" | grep -v node_modules
```

Only `examples/react` may match. `symbiote-native.dev` deep-link URLs are the
app's own and stay as they are.
