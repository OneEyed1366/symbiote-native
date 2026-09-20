// Co-located Vue-driven pipeline test, ported from the headless `vue-fragment.smoke.ts`,
// proving the SAME fake-Fabric harness carries a non-React framework.
//
// Regression it guards: Vue brackets a Fragment (what `v-for` / list-`v-if` compile to) with
// EMPTY text nodes as start/end anchors: `hostCreateText('')`, not comments. Inside a non-Text
// container (a View) a raw text is invalid in Fabric, so the renderer must map an empty
// createText to an anchor (skipped at commit) or the mount throws
//   Text string "" must be rendered inside a <Text>

import { defineComponent, Fragment, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';

interface IRow {
  id: number;
  label: string;
}

const ROOT_TAG = 31;
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let addRow = (): void => {};
let dropRow = (): void => {};

// A fresh App per test; addRow/dropRow are rebound in its setup. Mounting it returns once the
// initial 2-row fragment is committed.
async function mountApp(): Promise<void> {
  const App = defineComponent({
    setup() {
      const rows = ref<IRow[]>([
        { id: 1, label: 'a' },
        { id: 2, label: 'b' },
      ]);
      let seq = 3;
      addRow = (): void => {
        rows.value.push({ id: seq, label: `row-${seq}` });
        seq += 1;
      };
      dropRow = (): void => {
        rows.value.pop();
      };
      // An explicit Fragment is exactly what `v-for` compiles to. Vue brackets it with
      // empty-text anchors, the case that used to throw on insert into the View.
      return () =>
        h('view', null, () => [
          h(
            Fragment,
            null,
            rows.value.map(row => h('text', { key: row.id }, () => row.label)),
          ),
        ]);
    },
  });
  mount(ROOT_TAG, App);
  await tick();
}

// Slot is a process singleton (installed once); per-test isolation is the surface.
const fabric = installRecordingFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// An anchor is created on the wire too (`OP_CREATE_ANCHOR`, for the commit walk to flatten away),
// carrying no view name — so a real Fabric create is one whose authored node has a name.
function realNodeCount(): number {
  return fabric.findAll(node => node.viewName !== '').length;
}

describe('Vue Fragment list on the engine', () => {
  it('mounts a 2-row fragment without throwing, creating only real nodes (6)', async () => {
    await mountApp();
    // flex root + View + 2x(Text + raw-text) = 6. The two empty-text fragment anchors create
    // ZERO native nodes. That is the fix.
    expect(realNodeCount(), 'mount creates only real nodes').toBe(6);
    expect(fabric.commits, 'mount commits once').toBe(1);
  });

  it('appending a keyed row creates exactly the new Text + raw-text (2)', async () => {
    await mountApp();
    fabric.reset();
    addRow();
    await tick();
    expect(realNodeCount(), 'append creates the new Text + raw-text').toBe(2);
    expect(fabric.commits, 'append commits once').toBe(1);
  });

  it('removing a keyed row creates no native node', async () => {
    await mountApp();
    fabric.reset();
    dropRow();
    await tick();
    expect(realNodeCount(), 'remove creates no native node').toBe(0);
    expect(fabric.commits, 'remove commits once').toBe(1);
  });
});
