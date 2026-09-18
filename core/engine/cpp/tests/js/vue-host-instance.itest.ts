// findNodeHandle against the REAL committed Fabric tag, replacing
// adapters/vue/src/host-instance/host-instance.test.ts's `installFabric()` half. That mirror
// assigned each node a unique, sequential fake tag, so `findNodeHandle(node) === committed.tag` was
// a real claim there. The recording host does the opposite on purpose — every node reads back the
// same `NO_TAG` sentinel — so the identical assertion under `installRecordingFabric()` compares two
// sentinels and proves nothing (mirror-elimination.md, "A tag comparison whose two sides are both
// NO_TAG sentinels proves nothing"). There is no third JS-side option: only a real committed Fabric
// surface hands back a real, distinguishing tag, which is what this file runs against.

import {
  defineComponent,
  findNodeHandle,
  h,
  mount,
  ref,
  shallowRef,
} from '@symbiote-native/vue';
import {
  createElement,
  isSymbioteNode,
  type IHostInstance,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  committedTags,
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;
const PROBE_ID = 'probe';
const RAW_TAG = 9_001;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

function isHostInstance(el: unknown): el is IHostInstance {
  return (
    isSymbioteNode(el) &&
    typeof Reflect.get(el, 'setNativeProps') === 'function'
  );
}

describe('Vue findNodeHandle on the real engine', () => {
  it('resolves a ref-held host node to its real committed native tag', async () => {
    const nodeRef = shallowRef<ISymbioteNode | null>(null);
    const setNode = (el: unknown): void => {
      nodeRef.value = isSymbioteNode(el) ? el : null;
    };
    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('view', { testID: PROBE_ID, ref: setNode }),
      }),
    );
    surface.commit();
    await tick();

    const node = nodeRef.value;
    expect(node !== null).toBe(true);
    if (node === null) throw new Error('unreachable: host node missing');

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined) throw new Error('unreachable: probe view missing');
    // Real tags are allocated by SymbioteTree.cpp and are never 0/NO_TAG for a mounted view.
    expect(view.tag > 0).toBe(true);
    expect(findNodeHandle(node)).toBe(view.tag);
    // ...and so does the Vue Ref carrying it (the isRef unwrap path).
    expect(findNodeHandle(nodeRef)).toBe(view.tag);
  });

  it('passes a raw number through unchanged', () => {
    expect(findNodeHandle(RAW_TAG)).toBe(RAW_TAG);
  });

  it('unwraps a plain ref() (a reactive Proxy) back to the raw node before resolving', async () => {
    const deepRef = ref<ISymbioteNode | null>(null);
    const setNode = (el: unknown): void => {
      deepRef.value = isSymbioteNode(el) ? el : null;
    };
    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('view', { testID: PROBE_ID, ref: setNode }),
      }),
    );
    surface.commit();
    await tick();

    const view = findByTestId(PROBE_ID);
    expect(view !== undefined).toBe(true);
    if (view === undefined) throw new Error('unreachable: probe view missing');
    expect(findNodeHandle(deepRef)).toBe(view.tag);
  });

  it('returns null for null, undefined, and an empty ref', () => {
    expect(findNodeHandle(null)).toBe(null);
    expect(findNodeHandle(undefined)).toBe(null);
    expect(findNodeHandle(shallowRef(null))).toBe(null);
  });

  it('returns null for a plain object that is not a ref, a number, or a symbiote host node', () => {
    expect(findNodeHandle({ notAHostNode: true })).toBe(null);
  });

  it('returns null for a symbiote node that was created but never committed', () => {
    expect(findNodeHandle(createElement('RCTView'))).toBe(null);
  });

  it('grafts measure / setNativeProps onto a ref-held <View>, and setNativeProps re-commits onto the real tree', async () => {
    const nodeRef = shallowRef<IHostInstance | null>(null);
    const setNode = (el: unknown): void => {
      nodeRef.value = isHostInstance(el) ? el : null;
    };
    const surface = mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => h('view', { testID: PROBE_ID, ref: setNode }),
      }),
    );
    surface.commit();
    await tick();

    const node = nodeRef.value;
    expect(node !== null).toBe(true);
    if (node === null) throw new Error('unreachable: public instance missing');
    expect(typeof node.measure).toBe('function');
    expect(typeof node.setNativeProps).toBe('function');

    const before = committedTags().length;
    node.setNativeProps({ accessibilityLabel: 'grafted' });
    await Promise.resolve();
    surface.commit();

    // A re-commit re-clones the same node rather than growing the tree.
    expect(committedTags().length).toBe(before);
    const relabeled = findByTestId(PROBE_ID);
    expect(relabeled !== undefined).toBe(true);
    if (relabeled === undefined)
      throw new Error('unreachable: probe view missing');
    expect(relabeled.props.accessibilityLabel).toBe('grafted');
  });
});

report();
