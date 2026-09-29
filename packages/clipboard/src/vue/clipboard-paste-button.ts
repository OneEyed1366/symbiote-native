import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { renderClipboardPasteButton } from '../core/clipboard-paste-button';

/** Vue twin of `expo-clipboard`'s `ClipboardPasteButton` (`UIPasteControl`), iOS only */
export const ClipboardPasteButton = defineComponent({
  name: 'ClipboardPasteButton',
  // Every attribute is a native view prop, so none falls through onto a wrapper element
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return (): VNode | null => {
      const descriptor = renderClipboardPasteButton(normalizeVueAttrs(attrs));
      return descriptor ? descriptorToVue(descriptor) : null;
    };
  },
});
