// Vue `ScreenFooter`: the native footer view of a `formSheet`, attributes fall through to it

import { defineComponent, h } from '@vue/runtime-core';
import { RNS_SCREEN_FOOTER_VIEW_NAME } from '../core';

export const ScreenFooter = defineComponent({
  name: 'ScreenFooter',
  setup:
    (_props, { slots }) =>
    () =>
      h(RNS_SCREEN_FOOTER_VIEW_NAME, null, slots.default?.()),
});
