# @symbiote-native/linear-gradient

[`expo-linear-gradient`](https://docs.expo.dev/versions/latest/sdk/linear-gradient/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. A native view that
paints a multi-color gradient behind its children.

## Install

```bash
npx @symbiote-native/cli new my-app --linear-gradient   # new app
npx @symbiote-native/cli add --linear-gradient          # existing app
```

Manual: `npm install @symbiote-native/linear-gradient`, then wire `expo-modules-autolinking` once
per app. Never install `expo-linear-gradient` or the `expo` meta-package yourself.

## Usage

```tsx
import { LinearGradient } from '@symbiote-native/linear-gradient/react';

<LinearGradient colors={['#4c669f', '#192f6a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
  <Text>Over the gradient</Text>
</LinearGradient>;
```

Same props on every adapter: `colors` (two or more), `locations`, `start`, `end`, `dither`
(Android), `style` and the View accessibility surface. Children come through the framework's own
mechanism (`children`, default slot, snippet, `<ng-content>`).

## Layout

| Platform | Structure                                                      |
| -------- | -------------------------------------------------------------- |
| iOS      | the native view is the root, children are inside it           |
| Android  | a `View` wraps an absolute-fill native leaf, children beside it |

Angular cannot spell a dynamic tag name or project into a descriptor-built node, so it keeps one
component per platform (`index.ios.ts` / `index.android.ts`) with the same inputs.

## Not ported

The web variant (`LinearGradient.web.tsx`) and `NativeLinearGradient` re-export: native only.
