// `primitive-suite.ts` through the Vue adapter — the reference column the Angular arm is read against.
//
// RUN ON `build-release` with `SYMBIOTE_ITEST_BYTECODE=1`, one arm per process.

import { nextTick, shallowRef } from '@vue/runtime-core';
import { h, mount } from '@symbiote-native/vue';

import {
  CHILD_STYLE,
  runPrimitiveSuite,
  type IPrimitiveSpec,
  type IPrimitiveState,
} from './primitive-suite';
import { describe, flushTimers, it, mounted, report } from './harness';

const ROOT_TAG = 1;

// Each tag's measured `createKB` plus 10%, т.к. the bytes repeat exactly run to run and the margin
// is there for a legitimate small growth rather than for noise
const CREATE_BUDGET_KB: ReadonlyMap<string, number> = new Map([
  ['view', 1_400],
  ['text', 2_190],
  ['image', 1_770],
  ['image-background', 2_350],
  ['pressable', 1_390],
  ['touchable-opacity', 3_950],
  ['touchable-highlight', 3_560],
  ['touchable-native-feedback', 3_150],
  ['touchable-without-feedback', 3_270],
  ['button', 4_480],
  ['text-input', 3_420],
  ['text-input-multiline', 3_420],
  ['switch', 2_220],
  ['activity-indicator', 2_310],
  ['scroll-view', 2_510],
  ['horizontal-scroll-view', 2_510],
  ['safe-area-view', 1_510],
  ['modal', 170],
  ['refresh-control', 4_340],
]);

const spec = shallowRef<IPrimitiveSpec | undefined>(undefined);
const state = shallowRef<IPrimitiveState>({ items: [] });

function renderItem(
  current: IPrimitiveSpec,
  item: IPrimitiveState['items'][number],
) {
  const children =
    current.child === 'label'
      ? item.label
      : current.child === 'view'
        ? [h('view', { style: CHILD_STYLE })]
        : undefined;
  const element = h(current.tag, { ...item.props, key: item.id }, children);
  return current.parent === undefined
    ? element
    : h(current.parent, { key: item.id }, [element]);
}

describe('every primitive through the Vue adapter', () => {
  it('runs the primitive steps', async () => {
    const surface = mount(ROOT_TAG, {
      render: () => {
        const current = spec.value;
        return h(
          'view',
          { style: { flex: 1 } },
          current === undefined
            ? []
            : state.value.items.map(item => renderItem(current, item)),
        );
      },
    });
    flushTimers();
    surface.commit();
    mounted();

    await runPrimitiveSuite({
      name: 'vue',
      chrome: 3,
      createBudgetKB: CREATE_BUDGET_KB,
      apply: async (next, nextState) => {
        spec.value = next;
        state.value = nextState;
        await nextTick();
        flushTimers();
        surface.commit();
      },
    });
  });
});

report();
