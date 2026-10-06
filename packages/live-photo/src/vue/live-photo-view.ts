import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { createHostNodeHolder } from '@symbiote-native/components';
import { createLivePhotoViewHandle, renderLivePhotoView } from '../core';

/** Vue twin of `expo-live-photo`'s `LivePhotoView`, iOS only */
export const LivePhotoView = defineComponent({
  name: 'LivePhotoView',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs, expose }) {
    const host = createHostNodeHolder();
    expose(createLivePhotoViewHandle(host.getNode));
    return (): VNode | null => {
      const descriptor = renderLivePhotoView(normalizeVueAttrs(attrs));
      return descriptor ? descriptorToVue(host.capture(descriptor)) : null;
    };
  },
});
