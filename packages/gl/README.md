# @symbiote-native/gl

[`expo-gl`](https://docs.expo.dev/versions/latest/sdk/gl-view/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. A `GLView` that
gives a WebGL2 context to draw into, headless contexts and snapshots.

## Install

```bash
npx @symbiote-native/cli new my-app --gl   # new app
npx @symbiote-native/cli add --gl          # existing app
```

Manual: `npm install @symbiote-native/gl`, then wire `expo-modules-autolinking` once per app.
Never install `expo-gl` or the `expo` meta-package yourself.

## Usage

```tsx
import { GLView, type IExpoWebGLRenderingContext } from '@symbiote-native/gl/react';

function onContextCreate(gl: IExpoWebGLRenderingContext) {
  gl.clearColor(0, 1, 1, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.endFrameEXP();
}

<GLView style={{ flex: 1 }} onContextCreate={onContextCreate} />;
```

The statics of upstream's `GLView` class are plain functions: `createContextAsync`,
`destroyContextAsync`, `takeSnapshotAsync`, `getWorkletContext`. The handle of a view has
`exglCtxId`, `createCameraTextureAsync`, `destroyObjectAsync` and `takeSnapshotAsync`, reached by a
`ref` in React and Solid (`ref={fn}`), a template ref in Vue, `bind:this` in Svelte and a
`@ViewChild` in Angular. `gl.__expoSetLogging` prints with `console.warn`.

## Not ported

The web build, the hidden `nativeRef_EXPERIMENTAL` prop and upstream's one test (skipped there).
