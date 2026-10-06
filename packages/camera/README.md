# @symbiote-native/camera

[`expo-camera`](https://docs.expo.dev/versions/latest/sdk/camera/) for **every**
[SymbioteNative](../../README.md) adapter: React, Vue, Svelte, Solid and Angular. The camera
preview, pictures, video recording and barcode scanning.

## Install

```bash
npx @symbiote-native/cli new my-app --camera   # new app
npx @symbiote-native/cli add --camera          # existing app
```

Manual: `npm install @symbiote-native/camera`, then wire `expo-modules-autolinking` once per app.
Never install `expo-camera` or the `expo` meta-package yourself.

## Usage

```tsx
import { CameraView, useCameraPermissions, type ICameraViewHandle } from '@symbiote-native/camera/react';

const [permission, requestPermission] = useCameraPermissions();
const ref = useRef<ICameraViewHandle>(null);

<CameraView ref={ref} style={{ flex: 1 }} facing="back" onBarcodeScanned={scan => console.log(scan.data)} />;

const picture = await ref.current?.takePictureAsync({ quality: 0.8 });
```

The view takes the props of upstream's `CameraView` plus the View surface. The handle has
`takePictureAsync`, `recordAsync`, `toggleRecordingAsync`, `stopRecording`, `pausePreview`,
`resumePreview`, `getAvailablePictureSizesAsync`, `getAvailableLensesAsync` and
`getSupportedFeatures`. A `ref` carries it in React and Solid (`ref={fn}`), the exposed members of
a template ref in Vue, `bind:this` in Svelte and `@ViewChild` in Angular.

The static members of upstream's `CameraView` are functions of the package: `isCameraAvailableAsync`
(was `CameraView.isAvailableAsync`), `getAvailableVideoCodecsAsync`, `launchScanner`,
`dismissScanner`, `onModernBarcodeScanned` and `isModernBarcodeScannerAvailable()`. `Camera`,
`scanFromURLAsync` and `PictureRef` keep their names. The permission hooks are
`useCameraPermissions` and `useMicrophonePermissions`, in Angular `CameraPermissionsService` and
`MicrophonePermissionsService`.

## App setup

The package declares what `expo-camera`'s config plugin adds, and the `expo-modules-link`
postinstall writes it into the app:

| File                 | Entry                                                          |
| -------------------- | -------------------------------------------------------------- |
| `Info.plist`         | `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`     |
| `AndroidManifest.xml`| `CAMERA`, `RECORD_AUDIO`                                       |

## Not ported

The web build (`.web` files, the browser barcode detector) and the plugin's
`barcodeScannerEnabled: false` switch, which only trims the native binary size. The only upstream
test covers the web manager, the suites here are written against the native behavior.
