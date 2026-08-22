// Solid twin of adapters/react's refresh-control tests and adapters/vue's. RefreshControl is almost
// pure forwarding, so what is worth pinning is the three things that are NOT: the Fabric view name,
// `onRefresh` becoming an EVENT rather than a prop, and the aria fold — plus the Solid-only
// vanished-key case, which no other adapter can hit.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { View } from './view';
import { RefreshControl } from './refresh-control';

const ROOT_TAG = 819;
const REFRESH_CONTROL = 'PullToRefreshView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committedControl(): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && node.viewName === REFRESH_CONTROL)
        found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined)
    throw new Error(`no ${REFRESH_CONTROL} was committed`);
  return found;
}

function createdControl(): IFakeNode {
  const node = fabric.find(entry => entry.viewName === REFRESH_CONTROL);
  if (node === undefined) throw new Error(`no ${REFRESH_CONTROL} was created`);
  return node;
}

describe('Solid RefreshControl on the engine', () => {
  describe('Positive', () => {
    // why: the iOS Fabric component is PullToRefreshView (Android's manager resolves the same
    // intrinsic to AndroidSwipeRefreshLayout). A wrong name means the host never resolves a
    // component and nothing paints, which no JS-level check would catch.
    it('emits the Fabric view name and forwards refreshing', async () => {
      mount(ROOT_TAG, () => <RefreshControl refreshing />);
      await tick();
      expect(committedControl().props.refreshing).toBe(true);
    });

    // why: `onRefresh` is a ViewConfig EVENT, and routeProp decides that from the node's own config
    // rather than from the `on` prefix. If it were forwarded as a prop instead, native would never
    // report the gesture AND Android's folly::dynamic serializer would crash trying to stringify a
    // function.
    it('routes onRefresh to the native refresh event and never onto the prop bag', async () => {
      let refreshes = 0;
      mount(ROOT_TAG, () => (
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            refreshes++;
          }}
        />
      ));
      await tick();

      expect('onRefresh' in committedControl().props).toBe(false);
      fabric.fireEvent(createdControl().instanceHandle, 'topRefresh');
      expect(refreshes).toBe(1);
    });

    // why: native reads only `accessibility*`; the web aliases have to be folded in JS before the
    // commit. RefreshControl owns its host element rather than rendering through a View, so the fold
    // is its own job — skipping it leaves the control unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <RefreshControl refreshing={false} aria-label="reload" aria-busy />
      ));
      await tick();

      const props = committedControl().props;
      expect(props.accessibilityLabel).toBe('reload');
      expect(props.accessibilityState).toEqual({ busy: true });
    });

    // why: Solid-only, and silent everywhere else. `resolveAccessibilityProps` has two branches with
    // DIFFERENT key sets, and Solid's `spread` walks only the CURRENT keys with no removal pass — so
    // an `aria-label` that goes undefined drops the folded `accessibilityLabel` KEY and a screen
    // reader keeps announcing a label the app already removed. React and Vue never meet this: they
    // hand their reconciler a whole new prop object and the engine's diffProps sends the vanished
    // key down as an explicit delete.
    it('clears a folded accessibility prop when its aria alias goes undefined', async () => {
      const [label, setLabel] = createSignal<string | undefined>('reload');
      mount(ROOT_TAG, () => (
        <RefreshControl refreshing={false} aria-label={label()} />
      ));
      await tick();
      expect(committedControl().props.accessibilityLabel).toBe('reload');

      setLabel(undefined);
      await tick();
      // An explicit `null` is what a DELETE looks like on the wire (the engine's diffProps
      // convention); the failure this guards is the key staying at 'reload'.
      expect(committedControl().props.accessibilityLabel).toBeNull();
    });

    // why: the Android spinner props have no iOS counterpart, so RN forwards them raw and lets each
    // native manager read what it understands. Filtering them in JS would silently disable Android
    // theming while iOS looked fine.
    it('forwards the Android-only spinner props untouched', async () => {
      mount(ROOT_TAG, () => (
        <RefreshControl
          refreshing={false}
          colors={['#ff0000']}
          progressBackgroundColor="#ffffff"
          size="large"
          enabled={false}
          progressViewOffset={12}
        />
      ));
      await tick();

      const props = committedControl().props;
      expect(props.colors).toEqual(['#ff0000']);
      expect(props.progressBackgroundColor).toBe('#ffffff');
      expect(props.size).toBe('large');
      expect(props.enabled).toBe(false);
      expect(props.progressViewOffset).toBe(12);
    });

    // why: on Android the scroll view nests INSIDE the refresh control, so the control has to host a
    // child at all. A childless implementation looks correct on iOS and drops the whole screen on
    // Android.
    it('hosts a child', async () => {
      mount(ROOT_TAG, () => (
        <RefreshControl refreshing={false}>
          <View testID="wrapped" />
        </RefreshControl>
      ));
      await tick();
      expect(committedControl().children[0]?.props.testID).toBe('wrapped');
    });
  });

  describe('Negative', () => {
    // why: `onRefresh` is optional in RN — a display-only control (refreshing driven entirely by the
    // parent) must not throw when native reports the gesture with nothing wired.
    it('tolerates a refresh event with no handler', async () => {
      mount(ROOT_TAG, () => <RefreshControl refreshing={false} />);
      await tick();
      expect(() => {
        fabric.fireEvent(createdControl().instanceHandle, 'topRefresh');
      }).not.toThrow();
    });
  });
});
