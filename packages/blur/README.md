# @symbiote-native/blur

[`expo-blur`](https://docs.expo.dev/versions/latest/sdk/blur-view/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. `BlurView` blurs
what is behind it, `BlurTargetView` marks the content Android blurs.

## Install

```bash
npx @symbiote-native/cli new my-app --blur   # new app
npx @symbiote-native/cli add --blur          # existing app
```

Manual: `npm install @symbiote-native/blur`, then wire `expo-modules-autolinking` once per app.
Never install `expo-blur` or the `expo` meta-package yourself.

## Usage

```tsx
import { BlurTargetView, BlurView } from '@symbiote-native/blur/react';

const target = useRef<IHostInstance>(null);

<BlurTargetView ref={target}>
  <Image source={photo} />
</BlurTargetView>;
<BlurView blurTarget={target} blurMethod="dimezisBlurView" tint="light" intensity={60}>
  <Text>Over the blur</Text>
</BlurView>;
```

Same props on every adapter: `tint`, `intensity`, `blurMethod`, `blurReductionFactor` and the View
surface. `blurTarget` takes each framework's own reference to the `BlurTargetView`:

| Adapter | Target reference                       |
| ------- | -------------------------------------- |
| React   | `ref` object on `BlurTargetView`       |
| Vue     | template ref on `BlurTargetView`       |
| Svelte  | `bind:ref` on `BlurTargetView`         |
| Solid   | `ref={setTarget}` signal value         |
| Angular | template reference variable `#target`  |

## Layout

A transparent `View` holds the style and children, with the native blur filling it behind them.
`BlurTargetView` is native on Android and a plain `View` on iOS, where blur needs no target.

## Not ported

The web variant (`BlurView.web.tsx`, `getBackgroundColor`) and the Reanimated `getAnimatableRef` hook.
Angular templates spell the Android target tag statically, so an `__expo_app_identifier__` suffix makes
it warn instead of render.
