import { defineNativeViewComponent } from '@symbiote-native/vue';
import { createImageView } from '../core';

/** Vue twin of `expo-image`'s `Image`, `ref` gets the handle of the view */
export const Image = defineNativeViewComponent('Image', createImageView);
