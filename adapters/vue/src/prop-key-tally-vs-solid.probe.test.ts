// Extends F-79/F-75's closure (`.docs/tree-inefficiency-findings.md`) to Vue: CLAUDE.md's own
// device numbers read `WRITES` on Create as vue 15003/2 against solid 15001/0 — 2 already
// attributed to `pushClassStyle` republishing an unchanged class (fixed by `isAlreadyPublished`,
// per CLAUDE.md's own "the guard's Vue-only write drop" paragraph), so this file checks whether
// anything survives that fix at the per-row level. Full 10-node row (text-input included), one row
// pushed reactively, no CSS rules — same protocol as the React and Angular twins.
import { defineComponent, h, shallowRef } from 'vue';
import { describe, it } from 'vitest';
import { clearGlobalStyles, takePropKeyTally } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from './index';

globalThis.__SYMBIOTE_DEBUG__ = true;

installRecordingFabric();

const ROOT_TAG = 91_992;
const noop = (): void => {};
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IRow = { id: number; label: string };

// Byte-identical to examples/vue-sfc/components/BenchmarkRow.vue (minus the isSelected class
// swap, which writes no NEW key this file's tally would see — both branches still write `class`).
const Row = defineComponent({
  props: { row: { type: Object as () => IRow, required: true } },
  setup: props => () =>
    h('view', { class: 'bench-row' }, [
      h('text', { class: 'bench-row-id' }, String(props.row.id)),
      h('pressable', { class: 'flex1', onPress: noop }, [
        h('text', { class: 'bench-row-label' }, props.row.label),
      ]),
      h('pressable', { class: 'bench-row-remove', onPress: noop }, [
        h('text', { class: 'bench-row-remove-text' }, 'x'),
      ]),
      h('text-input', { class: 'bench-row-input', value: props.row.label }),
    ]),
});

const rows = shallowRef<readonly IRow[]>([]);

const App = defineComponent({
  setup: () => () =>
    h(
      'view',
      {},
      rows.value.map(row => h(Row, { key: row.id, row })),
    ),
});

describe('propKeyTally: Vue reactive push of ONE full (10-node) row vs Solid', () => {
  it('names the exact (component.key) any write-count difference is at', async () => {
    const surface = mount(ROOT_TAG, App);
    await tick();
    takePropKeyTally(); // discard the empty mount's own cost — price only the reactive push

    rows.value = [{ id: 1, label: 'row label' }];
    await tick();

    const tally = takePropKeyTally();
    unmount(ROOT_TAG);
    clearGlobalStyles();
    void surface;

    const total = [...tally.values()].reduce((sum, count) => sum + count, 0);
    const lines = [...tally.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `  ${key}: ${String(count)}`);
    console.log(
      `DEBUG vue reactive-push propKeyTally (total=${String(total)}):\n${lines.join('\n')}`,
    );
  });
});
