---
'@symbiote-native/camera': minor
'@symbiote-native/gl': patch
'@symbiote-native/live-photo': patch
---

`CameraView` hands out its host node through `getHostNode()` in every adapter, which `createCameraTextureAsync` of a GL view takes for a live camera texture. `CameraView`, `GLView` and `LivePhotoView` accept `className` in React.
