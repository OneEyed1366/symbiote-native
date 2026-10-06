import { defineNativeViewComponent } from '@symbiote-native/vue';
import { createGLView } from '../core';

/** Vue twin of `expo-gl`'s `GLView`, `ref` gets the handle of the view */
export const GLView = defineNativeViewComponent('GLView', createGLView);
