# @symbiote-native/live-photo

## 0.1.0

### Minor Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/live-photo`: `LivePhotoView` with `startPlayback` and `stopPlayback` on React, Vue, Svelte, Solid and Angular, and a `--live-photo` layer in the CLI. The engine gains `defineExpoViewMethods` for calling the functions of an Expo native view, and Angular's `DescriptorOutlet` exposes the host node it painted as `rootNode`.

### Patch Changes

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Add `@symbiote-native/camera`: `CameraView` with its picture, recording and preview functions, the camera and microphone permission hooks, the system barcode scanner and `scanFromURLAsync` on React, Vue, Svelte, Solid and Angular, and a `--camera` layer in the CLI. `@symbiote-native/components` gains `createHostNodeHolder`, which a component uses to reach the host node of its descriptor, and Angular's `NativeViewBase` gains `hostNode()` for the same.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `CameraView` hands out its host node through `getHostNode()` in every adapter, which `createCameraTextureAsync` of a GL view takes for a live camera texture. `CameraView`, `GLView` and `LivePhotoView` accept `className` in React.

- [#93](https://github.com/OneEyed1366/symbiote-native/pull/93) [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Bring the README of every Tier 3 and Tier 4 Expo package to the package README template, with per-adapter examples, API signatures and a Common questions section with cited sources. Correct the comment on `ICheckboxProps.color`: the grey disabled look is applied after it.

- Updated dependencies [[`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851), [`5435556`](https://github.com/OneEyed1366/symbiote-native/commit/5435556869929fe5fd4798ac8f3dedb2fe893851)]:
  - @symbiote-native/components@3.2.0
