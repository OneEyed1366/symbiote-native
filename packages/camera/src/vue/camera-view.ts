import { defineNativeViewComponent } from '@symbiote-native/vue';
import { createCameraView } from '../core';

/** Vue twin of `expo-camera`'s `CameraView` */
export const CameraView = defineNativeViewComponent(
  'CameraView',
  createCameraView,
);
