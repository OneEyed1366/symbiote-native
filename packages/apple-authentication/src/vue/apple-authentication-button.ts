import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import { renderAppleAuthenticationButton } from '../core/apple-authentication-button';

/** Vue twin of `expo-apple-authentication`'s `AppleAuthenticationButton`, iOS only */
export const AppleAuthenticationButton = defineComponent({
  name: 'AppleAuthenticationButton',
  // Все атрибуты это пропсы нативного view, на обёртку ничего не должно просочиться
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return (): VNode | null => {
      const descriptor = renderAppleAuthenticationButton(
        normalizeVueAttrs(attrs),
      );
      return descriptor ? descriptorToVue(descriptor) : null;
    };
  },
});
