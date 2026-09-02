// useRawAttrs hands a setup body the UNPROXIED attrs object. Two things must hold or the
// optimization is a correctness bug, and neither is visible in a render-once test:
//
//   1. the bag it returns is not the tracking proxy the setup context exposes, and
//   2. a reference captured ONCE at setup still reads current values after an update - Vue mutates
//      `instance.attrs` in place rather than replacing it, and the whole capture-once design rests
//      on that.
//
// (2) is the load-bearing one. If Vue ever started replacing the object, every component using this
// would freeze at its mount-time attrs while rendering perfectly - the silent shape this repo keeps
// getting bitten by. The re-render assertion below is what would go red.

import {
  defineComponent,
  h,
  ref,
  type Ref,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { useRawAttrs } from './use-raw-attrs';

const ROOT_TAG = 909;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

let captured: Record<string, unknown> | undefined;
let contextBag: Record<string, unknown> | undefined;

const Probe = defineComponent({
  inheritAttrs: false,
  setup(_props, { attrs }) {
    contextBag = attrs;
    captured = useRawAttrs(attrs);
    return (): VNode => h('symbiote-view', { testID: 'probe' });
  },
});

let label: Ref<string> | undefined;

const App = defineComponent({
  setup() {
    const value = ref('first');
    label = value;
    return (): VNode => h(Probe, { testID: value.value });
  },
});

describe('useRawAttrs', () => {
  it('returns the context bag itself when there is no current instance', () => {
    const plain = { onPress: 1 };
    expect(useRawAttrs(plain)).toBe(plain);
  });

  it('inside a component, returns a different object than the context attrs', async () => {
    mount(ROOT_TAG, App);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(captured).toBeDefined();
    expect(captured).not.toBe(contextBag);
    expect(captured?.testID).toBe('first');
  });

  it('the once-captured bag reflects a LATER attr change', async () => {
    mount(ROOT_TAG, App);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const atMount = captured;

    if (label !== undefined) label.value = 'second';
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(
      atMount,
      'Vue must mutate instance.attrs in place, not replace it',
    ).toBe(captured);
    expect(atMount?.testID, 'the captured bag must read the new value').toBe(
      'second',
    );
  });
});
