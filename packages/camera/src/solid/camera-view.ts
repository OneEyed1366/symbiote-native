import { defineNativeViewComponent } from '@symbiote-native/solid';
import { createCameraView } from '../core';
import type { ICameraViewHandle, ICameraViewProps } from '../core';

/** Solid twin of `expo-camera`'s `CameraView`, `ref` gets the handle of the view */
export const CameraView = defineNativeViewComponent<
  ICameraViewHandle,
  ICameraViewProps
>(createCameraView);
