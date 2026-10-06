# @symbiote-native/glass-effect

[`expo-glass-effect`](https://docs.expo.dev/versions/latest/sdk/glass-effect/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. Liquid Glass
native views on iOS 26, a plain `View` everywhere else.

## Install

```bash
npx @symbiote-native/cli new my-app --glass-effect   # new app
npx @symbiote-native/cli add --glass-effect          # existing app
```

Manual: `npm install @symbiote-native/glass-effect`, then wire `expo-modules-autolinking` once per
app. Never install `expo-glass-effect` or the `expo` meta-package yourself.

## Usage

```tsx
import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from '@symbiote-native/glass-effect/react';

<GlassContainer spacing={8}>
  <GlassView glassEffectStyle="clear" tintColor="rgba(255, 59, 48, 0.7)" isInteractive>
    <Text>Glass</Text>
  </GlassView>
</GlassContainer>;
```

Same props on every adapter: `glassEffectStyle` (`regular`, `clear`, `none` or a config with
`animate`), `tintColor`, `isInteractive`, `colorScheme`, `spacing` on the container, and the View
surface. Check `isLiquidGlassAvailable()` and `isGlassEffectAPIAvailable()` before relying on the
effect: some iOS 26 betas lack the API and crash.

## Layout

On iOS the native view is the root and the children sit inside it. Elsewhere both components are
a plain `View` without the glass props. Angular keeps one file set per platform
(`index.ios.ts`, `index.android.ts`) because a template spells the native tag statically, so an
`__expo_app_identifier__` suffix makes it warn instead of render.

## Not ported

Nothing: the upstream package has no web or Android variant beyond the plain `View`.
