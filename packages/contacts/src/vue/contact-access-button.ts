import { defineComponent, type VNode } from '@vue/runtime-core';
import { descriptorToVue, normalizeVueAttrs } from '@symbiote-native/vue';
import {
  isContactAccessButtonAvailable,
  renderContactAccessButton,
} from '../core/contact-access-button';

const ContactAccessButtonView = defineComponent({
  name: 'ContactAccessButton',
  // Every attribute is a native view prop, so none falls through onto a wrapper element
  inheritAttrs: false,
  setup(_props, { attrs }) {
    return (): VNode | null => {
      const descriptor = renderContactAccessButton(normalizeVueAttrs(attrs));
      return descriptor ? descriptorToVue(descriptor) : null;
    };
  },
});

/** Vue twin of `expo-contacts`' `ContactAccessButton`, iOS 18+ only, nothing elsewhere */
export const ContactAccessButton = Object.assign(ContactAccessButtonView, {
  /** True only on iOS 18.0 and newer */
  isAvailable: isContactAccessButtonAvailable,
});
