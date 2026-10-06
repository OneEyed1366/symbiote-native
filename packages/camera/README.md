# @symbiote-native/camera

[`expo-camera`](https://docs.expo.dev/versions/latest/sdk/camera/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. The camera
preview, pictures, video recording and barcode scanning.

Built the same way as [`@symbiote-native/clipboard`](../clipboard)'s `ClipboardPasteButton`, an
`expo-modules-core` native view reached through `requireNativeViewManager` (see the
`symbiote-expo-native-module` project skill: why `expo-modules-core` is depended on directly and never
the `expo` meta-package, why the upstream JS is hand-ported into `core/`, and how autolinking finds the
native module). One render function in `core/` returns a descriptor and every adapter only turns it into
its own element.

## Install

**New app:**

```bash
npx @symbiote-native/cli new my-app --camera
```

**Existing SymbioteNative app:**

```bash
npx @symbiote-native/cli add --camera
```

Either way: installs `@symbiote-native/camera` and wires the native autolinking automatically,
see [`@symbiote-native/cli`](../cli).

<details>
<summary>Manual install (no CLI - installing and wiring native autolinking by hand)</summary>

```bash
npm install @symbiote-native/camera
```

Depends on `expo-camera` and `expo-modules-core` directly (regular dependencies, pinned to exact
versions, since this package's `core/` is hand-ported against one specific native API shape).
Never install `expo-camera` yourself, and never add the `expo` package to this project: it bundles
its own Metro/Babel pipeline that conflicts with this project's own.

### Required one-time step: native autolinking wiring

`expo-camera`'s native code is discovered by `expo-modules-autolinking`, not by RN's own
`react-native.config.cjs` mechanism. Wire it into the native host app **once**, it covers this package
and every other `expo-modules-core` package with zero further changes. The steps and the
mechanics behind them are in the `symbiote-expo-native-module` skill and in
[`@symbiote-native/network`](../network)'s README; the reference app is `examples/expo-react`.

### Permissions

The package declares what `expo-camera`'s config plugin adds, and the `expo-modules-link` postinstall
writes it into the app:

| File                  | Entry                                                      |
| --------------------- | ---------------------------------------------------------- |
| `Info.plist`          | `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` |
| `AndroidManifest.xml` | `CAMERA`, `RECORD_AUDIO`                                   |

iOS wants the microphone text even if you only take pictures, because the same view can record. Reword
both texts to fit your app.

</details>

## Shape

```
src/core/                camera-view.ts - createCameraView(getNode): render, the handle (camera-view-handle.ts)
                         and the barcode throttle. camera-api.ts - the statics of upstream's class and the
                         permission calls. props.ts, picture-options.ts, picture-ref.ts, types.ts.
src/react/               @symbiote-native/camera/react   - CameraView, useCameraPermissions, useMicrophonePermissions
src/vue/                 @symbiote-native/camera/vue     - the same names
src/svelte/              @symbiote-native/camera/svelte  - the same names ({ status, requestPermission, getPermission })
src/solid/               @symbiote-native/camera/solid   - the same names
src/angular/             @symbiote-native/camera/angular - CameraView, CameraPermissionsService, MicrophonePermissionsService
```

## Use it

### React

```tsx
import { useRef } from 'react';
import { CameraView, useCameraPermissions, type ICameraViewHandle } from '@symbiote-native/camera/react';

const [permission, requestPermission] = useCameraPermissions();
const camera = useRef<ICameraViewHandle>(null);

return permission?.granted === true ? (
  <>
    <CameraView ref={camera} style={{ flex: 1 }} facing="back" />
    <button title="Take picture" onPress={() => camera.current?.takePictureAsync({ quality: 0.8 })} />
  </>
) : (
  <button title="Allow the camera" onPress={() => requestPermission()} />
);
```

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { CameraView, useCameraPermissions, type ICameraViewHandle } from '@symbiote-native/camera/vue';

const [permission, requestPermission] = useCameraPermissions();
const camera = ref<ICameraViewHandle | null>(null);
</script>

<template>
  <template v-if="permission?.granted === true">
    <CameraView ref="camera" :style="{ flex: 1 }" facing="back" />
    <button title="Take picture" @press="camera?.takePictureAsync({ quality: 0.8 })" />
  </template>
  <button v-else title="Allow the camera" @press="requestPermission()" />
</template>
```

### Angular

```ts
import { Component, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import { CameraPermissionsService, CameraView } from '@symbiote-native/camera/angular';

@Component({
  standalone: true,
  imports: [CameraView, SYMBIOTE_ELEMENTS],
  template: `
    @if (permission()?.granted === true) {
      <CameraView #camera [style]="{ flex: 1 }" facing="back" />
      <button title="Take picture" (press)="camera.takePictureAsync({ quality: 0.8 })" />
    } @else {
      <button title="Allow the camera" (press)="request()" />
    }
  `,
})
export class CameraCard {
  private readonly service = inject(CameraPermissionsService);
  readonly permission = this.service.connect();

  request(): void {
    void this.service.request();
  }
}
```

### Svelte

```svelte
<script lang="ts">
  import { CameraView, useCameraPermissions, type ICameraViewHandle } from '@symbiote-native/camera/svelte';

  const permission = useCameraPermissions();
  let camera = $state<ICameraViewHandle | undefined>();
</script>

{#if permission.status?.granted === true}
  <CameraView bind:this={camera} style={{ flex: 1 }} facing="back" />
  <button title="Take picture" onPress={() => camera?.takePictureAsync({ quality: 0.8 })} />
{:else}
  <button title="Allow the camera" onPress={() => permission.requestPermission()} />
{/if}
```

### Solid

```tsx
import { Show, createSignal } from 'solid-js';
import { CameraView, useCameraPermissions, type ICameraViewHandle } from '@symbiote-native/camera/solid';

const [permission, requestPermission] = useCameraPermissions();
const [camera, setCamera] = createSignal<ICameraViewHandle>();

<Show
  when={permission()?.granted === true}
  fallback={<button title="Allow the camera" onPress={() => requestPermission()} />}
>
  <CameraView ref={setCamera} style={{ flex: 1 }} facing="back" />
  <button title="Take picture" onPress={() => camera()?.takePictureAsync({ quality: 0.8 })} />
</Show>;
```

## API

```ts
<CameraView facing? flash? mode? zoom? mute? enableTorch? active?   // active is iOS only
            barcodeScannerSettings? onBarcodeScanned? onCameraReady? onMountError? ... />
// handle: takePictureAsync, recordAsync, toggleRecordingAsync, stopRecording, pausePreview,
//         resumePreview, getAvailablePictureSizesAsync, getAvailableLensesAsync, getSupportedFeatures

isCameraAvailableAsync(): Promise<boolean>         // was CameraView.isAvailableAsync
getAvailableVideoCodecsAsync(): Promise<ICameraVideoCodec[]>   // iOS
launchScanner(options?): Promise<void>             dismissScanner(): Promise<void>
onModernBarcodeScanned(listener): EventSubscription   isModernBarcodeScannerAvailable(): boolean
scanFromURLAsync(url, barcodeTypes = ['qr']): Promise<ICameraBarcodeScanningResult[]>
Camera.getCameraPermissionsAsync() and the three twins   // request and microphone variants
```

`PictureRef` keeps its name. Ported from upstream's `CameraView.tsx`, `Camera.ts` and `Camera.types.ts`.

## Notes

- **The postinstall asks for both permissions.** It writes `NSCameraUsageDescription` and
  `NSMicrophoneUsageDescription` into `Info.plist` and `CAMERA` and `RECORD_AUDIO` into the Android
  manifest. iOS needs the microphone text even if you only take pictures, because the same view can
  record. Reword both texts to fit your app.
- **Ask first, then render.** Show `CameraView` only once `useCameraPermissions` reports `granted`.
- **`onBarcodeScanned` turns scanning on.** The scanner is enabled exactly when you pass the prop,
  and `barcodeScannerSettings={{ barcodeTypes: [...] }}` narrows what it looks for.
- **`CameraView` takes no children.** The native view does not host them, so draw controls and
  frames as siblings, absolutely positioned over it.
- **The handle works after `onCameraReady`.** `takePictureAsync` and `recordAsync` before that can
  fail or return nothing.
- **`active={false}` stops the camera session without unmounting the view.** iOS only, it is on by
  default.
- **Not ported.** The web build (`.web` files, the browser barcode detector) and the plugin's `barcodeScannerEnabled: false` switch, which only trims the native binary size. The only upstream test covers the web manager, the suites here are written against the native behavior.

## Common questions

- **iOS crash when the camera opens.** A missing usage description. The postinstall writes
  `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`, iOS wants both for the camera view.
- **Black preview.** Render the view only when permission is `granted`, test on a device (the iOS
  Simulator has no camera) and wait for `onCameraReady` before calling the handle.
- **The barcode callback.** Passing `onBarcodeScanned` turns the scanner on. To scan once, pass
  `undefined` after the first result.
- **Children.** `CameraView` takes none, upstream says to overlay a sibling with absolute
  positioning.
- **Mounting and unmounting freezes or crashes iOS.** Keep the view mounted and set `active={false}`
  (iOS) to stop the session.
- **Torch turns off at once.** Set `enableTorch` after `onCameraReady`.
- **System scanner.** `launchScanner()`, iOS 16+ and Google's code scanner on Android.

Sources: [Expo docs: Camera](https://docs.expo.dev/versions/latest/sdk/camera/),
[expo/expo#11736](https://github.com/expo/expo/issues/11736),
[expo/expo#16126](https://github.com/expo/expo/issues/16126),
[expo/expo#37150](https://github.com/expo/expo/issues/37150),
[expo/expo#34957](https://github.com/expo/expo/issues/34957),
[expo/expo#48780](https://github.com/expo/expo/issues/48780),
[expo/expo#36352](https://github.com/expo/expo/issues/36352).

## Test it

No device is needed for the logic. The core tests (`src/core/*.test.ts`) replace `expo-modules-core`
(`requireNativeViewManager`, `Platform`) and assert the descriptor a render function returns. The
adapter tests (`src/{react,vue,solid,angular}/**/*.test.*`, `vitest`) render the real component over the
recording Fabric with an injected view config and assert the committed payload, and Svelte's
`*.smoke.test.ts` compile the `.svelte` files and mount them. Painting itself is verified on a device in
the six `examples/expo-*` canary apps (`examples/expo-react`, `examples/expo-vue-sfc`,
`examples/expo-vue-tsx`, `examples/expo-svelte`, `examples/expo-solid`, `examples/expo-angular`), see the
parent [README](../../README.md).

The permission hooks are tested with a fake native module (`use-camera-permissions.test.*`, the Angular
service test), the same pattern as every permission package.
