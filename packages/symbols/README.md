# @symbiote-native/symbols

[`expo-symbols`](https://docs.expo.dev/versions/latest/sdk/symbols/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. SF Symbols on iOS,
Material Symbols on Android drawn from a font loaded through `@symbiote-native/font`.

## Install

```bash
npx @symbiote-native/cli new my-app --symbols   # new app
npx @symbiote-native/cli add --symbols          # existing app
```

Manual: `npm install @symbiote-native/symbols`, then wire `expo-modules-autolinking` once per app.
Never install `expo-symbols`, `expo-font` or the `expo` meta-package yourself, the Android font path
comes with the `@symbiote-native/font` dependency.

## Usage

```tsx
import { SymbolView } from '@symbiote-native/symbols/react';
import bold from '@symbiote-native/symbols/androidWeights/bold';

<SymbolView
  name={{ ios: 'star.fill', android: 'star' }}
  weight={{ ios: 'bold', android: bold }}
  tintColor="orange"
  size={32}
  fallback={<Text>star</Text>}
/>;
```

Same props on every adapter: `name`, `type`, `scale`, `weight`, `colors`, `size`, `tintColor`,
`resizeMode`, `animationSpec` and the View surface. `fallback` is a prop on React and Solid, a slot
named `fallback` on Vue, a `fallback` snippet on Svelte and projected content on Angular. It renders
when the symbol has no name for the current platform.

## Platforms

| Platform | What renders                                                          |
| -------- | --------------------------------------------------------------------- |
| iOS      | the native `SymbolView` with every prop forwarded                     |
| Android  | an empty sized `View`, then the glyph in the Material Symbols font    |

The font loads once on mount. If loading fails the symbol stays an empty `View`.
`unstable_getMaterialSymbolSourceAsync(symbol, size, color)` renders a Material Symbol to an image
source for APIs that take an image, such as tab bar icons.

## Not ported

The macOS entry (`SymbolView.macos.tsx`) and the web build. Upstream ships no tests, so the suites here
are written against its behavior.
