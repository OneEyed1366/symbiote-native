# @symbiote-native/navigation-bar

A wrapper package for [SymbioteNative](../../README.md) that makes
[`expo-navigation-bar`](https://github.com/expo/expo/tree/main/packages/expo-navigation-bar)
- setting the Android navigation bar's button style and visibility - usable from **every**
adapter, React, Vue, Svelte, Solid, and Angular, not just React. **Android only**: upstream ships
no iOS implementation at all, so every function throws `UnavailabilityError` off Android,
matching this repo's own normalization convention for every other platform-gated package. Built
the same way as [`@symbiote-native/intent-launcher`](../intent-launcher): an
`expo-modules-core`-based wrapper (see the `symbiote-expo-native-module` project skill for the
full mechanism).

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --navigation-bar
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --navigation-bar
```

Either way: installs `@symbiote-native/navigation-bar` and wires the native autolinking
automatically, see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI, wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/navigation-bar
```

`expo-navigation-bar` and `expo-modules-core` come along as regular, pinned dependencies, never
install either yourself, and never add the `expo` meta-package to this project (it bundles its
own Metro/Babel pipeline that conflicts with this project's own).

### Required one-time step: native autolinking wiring

Unlike a plain RN native module, `expo-navigation-bar`'s native code is discovered by
`expo-modules-autolinking`, wired into the native host app **once**, covering this package and
every other `expo-modules-core` package with zero further changes. Full mechanics live in the
`symbiote-expo-native-module` skill.

### No manifest permissions, config plugin not carried over

- **No runtime permission, no manifest edit.** `expo-navigation-bar`'s own `AndroidManifest.xml`
  declares nothing.
- **The config plugin was checked and produces no diff with default props.** Upstream's
  `withNavigationBar` only touches `styles.xml` (`android:windowLightNavigationBar`,
  `android:enforceNavigationBarContrast`) when the app passes explicit plugin props
  (`hidden`/`style`/`enforceContrast`); with none given it returns the config unchanged, and this
  repo has no `app.json` for a plugin to read props from anyway. Setting an initial style/hidden
  value before first paint (rather than calling `setStyle`/`setHidden` after mount) needs those
  `styles.xml` edits applied by hand - not something `native-link.json` covers, since it has no
  style-resource field, only manifest attributes and iOS Info.plist array keys.

</details>

## Shape

```
src/core/                 setStyle + setHidden + addVisibilityListener + setVisibilityAsync +
                          getVisibilityAsync + the entries-stack merge core. The native module
                          resolution is Android-only (native-module/index.android.ts); the base
                          native-module/index.ts is an empty stub, same as upstream's own
                          non-Android ExpoNavigationBar.ts
src/react/                NavigationBar + useVisibility (hooks)
src/vue/                  NavigationBar + useVisibility (composable)
src/solid/                NavigationBar + createVisibility (primitive)
src/svelte/               NavigationBar.svelte + use-visibility.svelte.ts (rune)
src/angular/              NavigationBar + NavigationBarVisibilityService (DI)
```

Upstream's declarative `<NavigationBar>` component and `useVisibility` hook are ported to
**every** adapter, not just React: the merge-stack logic lives once in `src/core/entries-stack.ts`
(`pushStackEntry`/`popStackEntry`/`replaceStackEntry`), and each adapter supplies only its own
lifecycle glue over that shared core, per this project's `components_split_logic_view_lifecycle`
convention.

## Use it

```ts
import { setHidden, setStyle } from '@symbiote-native/navigation-bar';

setStyle('dark');
setHidden(true);
```

```ts
import { addVisibilityListener, getVisibilityAsync } from '@symbiote-native/navigation-bar';

const visibility = await getVisibilityAsync();
const subscription = addVisibilityListener(({ visibility }) => {
  console.log(visibility);
});
```

Declaratively, per adapter:

```tsx
// React / Vue / Solid: <NavigationBar style="dark" hidden={false} />
// Svelte: <NavigationBar style="dark" hidden={false} />
// Angular: <navigation-bar [style]="'dark'" [hidden]="false" />
```

The deepest mounted `<NavigationBar>` wins on shared fields (upstream's own priority rule);
unmounting the last one falls back to `defaultNavigationBarProps`.

## API

| Export | Signature | Notes |
| --- | --- | --- |
| `setStyle` | `(style: INavigationBarStyle) => void` | `'auto'`/`'inverted'` resolve against `Appearance.getColorScheme()`; skips a redundant native call when the resolved style is unchanged |
| `setHidden` | `(hidden: boolean) => void` | Skips a redundant native call when the value is unchanged |
| `addVisibilityListener` | `(listener: (event: INavigationBarVisibilityEvent) => void) => EventSubscription` | |
| `setVisibilityAsync` | `(visibility: INavigationBarVisibility) => Promise<void>` | Calls the native `setHidden` directly, bypassing `setHidden`'s own dedupe |
| `getVisibilityAsync` | `() => Promise<INavigationBarVisibility>` | |

## Notes

- **Every function throws `UnavailabilityError` off Android**, replacing upstream's own
  `console.warn`-and-no-op fallback - the same normalization this repo's other platform-gated
  packages already apply.
- **`setVisibilityAsync` forwards straight to the native module**, not through this package's own
  `setHidden`, matching upstream's exact observable behavior (and the ported test asserting it).

## Test it

```bash
pnpm vitest run packages/navigation-bar
```

The core tests fake the native module in place of `requireNativeModule`'s runtime resolution -
`ExpoNavigationBar` only exists on a real Android device, so a headless run would otherwise throw
at import. Upstream's own three tests (`resolves the visibility from the native module`,
`calls setHidden from setVisibilityAsync`, `adds and removes a visibility listener`) are all
ported, translated onto this package's own fake-native-module harness; `setStyle`/`setHidden`'s
resolve-and-dedupe behavior is net-new coverage upstream never exercised directly. Each adapter's
`NavigationBar`/visibility port has its own lifecycle test (push/replace/pop the stack entry,
resolve/track/clean up visibility), 53 tests total across the package.
