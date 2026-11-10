// Vue `FullWindowOverlay`: core picks the native view and its props, Vue fills it with the slot

import { defineComponent, h } from '@vue/runtime-core';
import { Platform, useWindowDimensions } from '@symbiote-native/vue';
import { resolveFullWindowOverlay } from '../core';

// `default: undefined` keeps Vue's boolean casting from turning an unset flag into false
export const FullWindowOverlay = defineComponent({
  name: 'FullWindowOverlay',
  props: {
    unstable_accessibilityContainerViewIsModal: {
      type: Boolean,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const dimensions = useWindowDimensions();
    return () => {
      const overlay = resolveFullWindowOverlay({
        unstable_accessibilityContainerViewIsModal:
          props.unstable_accessibilityContainerViewIsModal,
        isIOS: Platform.select({ ios: true, default: false }) === true,
        width: dimensions.value.width,
        height: dimensions.value.height,
      });
      return h(overlay.viewName, overlay.props, slots.default?.());
    };
  },
});
