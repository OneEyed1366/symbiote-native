import { defineNativeViewComponent } from '@symbiote-native/solid';
import { createImageView } from '../core';
import type { IImageViewHandle, IImageViewProps } from '../core';

/** Solid twin of `expo-image`'s `Image`, `ref` gets the handle of the view */
export const Image = defineNativeViewComponent<
  IImageViewHandle,
  IImageViewProps
>(createImageView);
