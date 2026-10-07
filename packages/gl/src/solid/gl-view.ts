import { defineNativeViewComponent } from '@symbiote-native/solid';
import { createGLView } from '../core';
import type { IGLViewHandle, IGLViewProps } from '../core';

/** Solid twin of `expo-gl`'s `GLView`, `ref` gets the handle of the view */
export const GLView = defineNativeViewComponent<IGLViewHandle, IGLViewProps>(
  createGLView,
);
