// Vue `ScreenContainer`: core picks the native view, other attributes fall through to it

import { defineComponent, h } from '@vue/runtime-core';
import { Platform } from '@symbiote-native/vue';
import { resolveScreenContainerViewName } from '../core';

// A Boolean prop reads `false` when absent, so `enabled` needs an explicit `undefined` default
export const ScreenContainer = defineComponent({
  name: 'ScreenContainer',
  props: {
    enabled: { type: Boolean, default: undefined },
    hasTwoStates: { type: Boolean, default: undefined },
  },
  setup:
    (props, { slots }) =>
    () =>
      h(
        resolveScreenContainerViewName({
          enabled: props.enabled,
          hasTwoStates: props.hasTwoStates,
          os: Platform.OS,
        }),
        null,
        slots.default?.(),
      ),
});
