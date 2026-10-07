import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { renderImageBackground } from '../core';

/** Vue twin of `expo-image`'s `ImageBackground`, the default slot paints over the image */
export const ImageBackground = defineComponent({
  name: 'ImageBackground',
  // Every attribute is a prop of the image or the view, nothing leaks onto the wrapper
  inheritAttrs: false,
  setup(_props, { attrs, slots }) {
    return (): VNode =>
      descriptorToVue(
        renderImageBackground(normalizeVueAttrs(attrs)),
        slots.default?.() ?? [],
      );
  },
});
