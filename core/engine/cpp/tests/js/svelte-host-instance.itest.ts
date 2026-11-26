// `hostInstance` / `findNodeHandle` against the REAL committed Fabric tag
// The recording host reads every node back as the same `NO_TAG` sentinel, so comparing tags
// under `installRecordingFabric()` would compare two sentinels and prove nothing

// The "live" cases drive a REAL compiled `.svelte` probe that stores its node with `{@attach}`
// The source is a real file next to this one (esbuild's `.svelte` loader), since the host has
// no filesystem to write to and no module loader to import with

// The "not a node" cases pass a plain object that `isSymbioteNode` rejects
// That stays on the adapter's public surface

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
// esbuild resolves this through the `.svelte` loader in `scripts/run-itests.mjs`
import Probe from './svelte-host-instance-probe.svelte';

const ROOT_TAG = 1;
// An object that is not an engine node, which a ref must never resolve to an instance or a tag
const NOT_A_NODE = { tagName: 'view' };

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('Svelte hostInstance / findNodeHandle on the real engine', () => {
  it('grafts a real measure/setNativeProps handle onto an {@attach} ref, and findNodeHandle agrees with the committed tag', async () => {
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
    // A re-commit re-clones the same node, so the tag never changes underneath a live ref
    expect(relabeled.tag).toBe(before);
    unmount(ROOT_TAG);
  });

  it('findNodeHandle passes a raw tag number straight through unchanged', () => {
    expect(findNodeHandle(42)).toBe(42);
  });

  it('hostInstance resolves to undefined for null, undefined and an object that is not a node', () => {
    expect(hostInstance(null)).toBe(undefined);
    expect(hostInstance(undefined)).toBe(undefined);
    expect(hostInstance(NOT_A_NODE)).toBe(undefined);
  });

  it('findNodeHandle resolves to null for null, undefined and an object that is not a node', () => {
    expect(findNodeHandle(null)).toBe(null);
    expect(findNodeHandle(undefined)).toBe(null);
    expect(findNodeHandle(NOT_A_NODE)).toBe(null);
  });
});

report();
