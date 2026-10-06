# @symbiote-native/gl

[`expo-gl`](https://docs.expo.dev/versions/latest/sdk/gl-view/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. A `GLView` that
gives a WebGL2 context to draw into, headless contexts and snapshots.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --gl
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --gl
```

Either way: installs `@symbiote-native/gl` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/gl
```

Depends on `expo-gl` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-gl` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-gl`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

</details>

## Shape

```
src/core/                gl-view.ts - the view and its handle. gl-context.ts - createContextAsync,
                         destroyContextAsync, takeSnapshotAsync, getWorkletContext, forgetting a context.
                         worklet-context-manager.ts - the optional Reanimated side, in its own file so an
                         import of Reanimated inside a try survives Metro's inline requires. gl-utils.ts,
                         gl-errors.ts, types.ts.
src/react/               @symbiote-native/gl/react   - GLView
src/vue/                 @symbiote-native/gl/vue     - GLView
src/svelte/              @symbiote-native/gl/svelte  - GLView (.svelte)
src/solid/               @symbiote-native/gl/solid   - GLView
src/angular/             @symbiote-native/gl/angular - GLView
```

A controller may define `dispose`, which every adapter runs on unmount (a React effect cleanup, Vue
`onUnmounted`, Solid `onCleanup`, a Svelte `$effect` teardown, Angular's `disposeView`). `GLView` uses it to
forget its context. The package tsconfig adds the DOM lib for the WebGL types.

## Use it

### React

```tsx
import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/react';

function onContextCreate(gl: IExpoWebGLRenderingContext) {
  gl.clearColor(0, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.endFrameEXP();
}

<GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />;
```

### Vue

```vue
<script setup lang="ts">
import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/vue';

function onContextCreate(gl: IExpoWebGLRenderingContext) {
  gl.clearColor(0, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.endFrameEXP();
}
</script>

<template>
  <GLView :style="{ flex: 1 }" @contextCreate="onContextCreate" />
</template>
```

### Angular

```ts
import { Component } from '@angular/core';
import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/angular';

@Component({
  standalone: true,
  imports: [GLView],
  template: `<GLView [style]="{ flex: 1 }" [onContextCreate]="onContextCreate" />`,
})
export class Surface {
  readonly onContextCreate = (gl: IExpoWebGLRenderingContext): void => {
    gl.clearColor(0, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.endFrameEXP();
  };
}
```

### Svelte

```svelte
<script lang="ts">
  import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/svelte';

  function onContextCreate(gl: IExpoWebGLRenderingContext) {
    gl.clearColor(0, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.endFrameEXP();
  }
</script>

<GLView style={{ flex: 1 }} {onContextCreate} />
```

### Solid

```tsx
import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/solid';

function onContextCreate(gl: IExpoWebGLRenderingContext) {
  gl.clearColor(0, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.endFrameEXP();
}

<GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />;
```

## API

```ts
<GLView onContextCreate={(gl: IExpoWebGLRenderingContext) => void} msaaSamples? enableExperimentalWorkletSupport? style? />
// gl is a WebGL2 context, call gl.endFrameEXP() at the end of every frame
// handle: exglCtxId, createCameraTextureAsync(camera), destroyObjectAsync(texture), takeSnapshotAsync(options?)

createContextAsync(): Promise<IExpoWebGLRenderingContext>      // headless
destroyContextAsync(exgl?: IExpoWebGLRenderingContext | number): Promise<boolean>
takeSnapshotAsync(exgl?: IExpoWebGLRenderingContext | number, options?): Promise<IGLSnapshot>
getWorkletContext(contextId: number): IExpoWebGLRenderingContext | undefined    // inside a worklet
GLLoggingOption  gl.__expoSetLogging(option)                    // prints the GL calls with console.warn
```

Ported from upstream's `GLView.tsx` and `GLView.types.ts`.

## Notes

- **Nothing reaches the screen until `endFrameEXP()`.** Call it at the end of every frame, including
  the first. The drawing buffer is presented only then.
- **`onContextCreate` runs once per surface.** Start your loop in it and stop it when the view
  unmounts. The package forgets the context of the view when it unmounts.
- **Texture images must be files on disk.** `gl.texImage2D` reads a file path, so load a bundled image
  with [`@symbiote-native/asset`](/docs/packages/asset/) and pass its `localUri` after
  `downloadAsync()` resolves.
- **Reanimated stays optional.** `getWorkletContext` and `enableExperimentalWorkletSupport` need
  `react-native-reanimated` in your app, the package does not depend on it.
- **Logging is printed with `console.warn`.** `gl.__expoSetLogging(option)` prints every GL call, which
  is slow, so switch it off once you have the answer.
- **Not ported.** The web build, the `nativeRef_EXPERIMENTAL` prop (hidden upstream) and upstream's one test, which is skipped there.
- **Not ported.** The web build, the hidden `nativeRef_EXPERIMENTAL` prop and upstream's one test (skipped there).

## Common questions

- **Black view.** Call `gl.endFrameEXP()` after drawing, then check
  `gl.getShaderInfoLog(shader)` and `gl.getProgramInfoLog(program)`: a failed program draws nothing
  without throwing.
- **Stutter.** One animated scene at a time (they share a GL thread), judge on a device (the iOS
  Simulator renders in software), `msaaSamples={0}` and 30 fps for a full-screen shader, and
  `precision highp float` in animated fragment shaders.
- **Crash in the background on iOS.** GL calls are forbidden once the app is inactive. Stop the loop
  when `AppState` leaves `active`.
- **Blank texture in a release build.** Pass the asset's `localUri` after `await asset.downloadAsync()`
  (`@symbiote-native/asset`), a not yet downloaded asset reports a name instead of a path.
- **Reanimated worklets.** Experimental: `enableExperimentalWorkletSupport` and
  `getWorkletContext(gl.contextId)`, needs `react-native-reanimated` in the app.
- **Camera texture memory.** Call `destroyObjectAsync(texture)` when done.

Sources: [Expo docs: GLView](https://docs.expo.dev/versions/latest/sdk/gl-view/),
[expo/expo#7367](https://github.com/expo/expo/issues/7367),
[expo/expo#18483](https://github.com/expo/expo/issues/18483),
[expo/expo#2693](https://github.com/expo/expo/issues/2693),
[expo/expo#11267](https://github.com/expo/expo/issues/11267),
[expo/expo#12468](https://github.com/expo/expo/issues/12468).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the view and the context bookkeeping. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).
