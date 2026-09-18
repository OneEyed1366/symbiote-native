// hostInstance / findNodeHandle against the REAL committed Fabric tag, replacing
// adapters/svelte/src/host-instance.test.ts's `installFabric()` half. That mirror assigned each
// node a unique, sequential fake tag, so `getNativeTag(node) === expected` was a real claim there.
// The recording host does the opposite on purpose — every node reads back the same `NO_TAG`
// sentinel — so the identical assertion under `installRecordingFabric()` compares two sentinels
// and proves nothing (mirror-elimination.md, "A tag comparison whose two sides are both NO_TAG
// sentinels proves nothing").
//
// The "live" cases drive a REAL compiled `.svelte` probe through `bind:this`, exactly like the
// original test's compiled-source harness — except the source is a real file next to this one
// (esbuild's `.svelte` loader), not a string compiled and dynamic-imported at test time (there is
// no filesystem to write to and no module loader to import with, here).
//
// The "not yet live" cases drop the original's `createRootShimElement`/`getShimDocument` harness —
// both internal, unexported modules — in favor of duck-typing the SAME shape `isShimElement`
// checks (`engineNode` + `tagName`), which stays entirely on the adapter's public surface.

import {
  findNodeHandle,
  hostInstance,
  mount,
  unmount,
} from '@symbiote-native/svelte';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';
// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`.
import Probe from './svelte-host-instance-probe.svelte';

const ROOT_TAG = 1;
// The exact shape `isShimElement` duck-types (adapters/svelte/src/host-instance.ts) for a shim
// whose `engineNode` has never gone live — a ref captured before the component's first commit.
const NOT_YET_LIVE = { engineNode: undefined, tagName: 'view' };

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('Svelte hostInstance / findNodeHandle on the real engine', () => {
  it('grafts a real measure/setNativeProps handle onto a bind:this ref, and findNodeHandle agrees with the committed tag', async () => {
    let captured: unknown;
    const surface = mount(ROOT_TAG, Probe, {
      onCapture: (box: unknown) => {
        captured = box;
      },
    });
    await tick();
    surface.commit();
    await tick();

    expect(captured !== undefined).toBe(true);
    const instance = hostInstance(captured);
    expect(instance !== undefined).toBe(true);
    if (instance === undefined)
      throw new Error('unreachable: no public instance');
    expect(typeof instance.measure).toBe('function');
    expect(typeof instance.setNativeProps).toBe('function');

    const view = findByTestId('ref-box');
    expect(view !== undefined).toBe(true);
    if (view === undefined) throw new Error('unreachable: probe view missing');
    expect(findNodeHandle(captured)).toBe(view.tag);

    const before = view.tag;
    instance.setNativeProps({ accessibilityLabel: 'grafted' });
    await tick();
    surface.commit();

    const relabeled = findByTestId('ref-box');
    expect(relabeled !== undefined).toBe(true);
    if (relabeled === undefined)
      throw new Error('unreachable: probe view missing');
    expect(relabeled.props.accessibilityLabel).toBe('grafted');
    // A re-commit re-clones the same node — the tag never changes underneath a live ref.
    expect(relabeled.tag).toBe(before);
    unmount(ROOT_TAG);
  });

  it('findNodeHandle passes a raw tag number straight through unchanged', () => {
    expect(findNodeHandle(42)).toBe(42);
  });

  it('hostInstance resolves to undefined for null, undefined and a not-yet-live shim', () => {
    expect(hostInstance(null)).toBe(undefined);
    expect(hostInstance(undefined)).toBe(undefined);
    expect(hostInstance(NOT_YET_LIVE)).toBe(undefined);
  });

  it('findNodeHandle resolves to null for null, undefined and a not-yet-live shim', () => {
    expect(findNodeHandle(null)).toBe(null);
    expect(findNodeHandle(undefined)).toBe(null);
    expect(findNodeHandle(NOT_YET_LIVE)).toBe(null);
  });
});

report();
