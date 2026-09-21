// Solid twin of adapters/react's refresh-control tests and adapters/vue's. RefreshControl is almost
// pure forwarding, so what is worth pinning is the three things that are NOT: the Fabric view name,
// `onRefresh` becoming an EVENT rather than a prop, and the aria fold — plus the Solid-only
// vanished-key case, which no other adapter can hit.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the controlled-spinner handshake lives in the tag's behavior, and only this
// module installs it. An app reaches it through the package barrel; a test importing render does not.
import '../register';
import { mount, unmount } from '../render';
// SIDE-EFFECT IMPORT: the controlled-spinner handshake reaches `<refresh-control>` through
// `registerRefreshControlBehavior`, which only this module calls.

const ROOT_TAG = 819;
const REFRESH_CONTROL = 'PullToRefreshView';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function committedControl(): ILiveNode {
  const found = live.findLive(
    live.appRoot(),
    node => node.viewName === REFRESH_CONTROL,
  );
  if (found === undefined)
    throw new Error(`no ${REFRESH_CONTROL} was committed`);
  return found;
}

/**
 * The control as the RECORDING holds it — two things only the record answers: `instanceHandle`,
 * which an event has to be aimed at, and a key the record LOST, which is proof a clearing op was
 * sent for it.
 */
function createdControl(): {
  instanceHandle: unknown;
  props: Readonly<Record<string, unknown>>;
} {
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
      mount(ROOT_TAG, () => <refresh-control refreshing />);
      await tick();
      expect(committedControl().payload.refreshing).toBe(true);
    });

    // why: `onRefresh` is a ViewConfig EVENT, and routeProp decides that from the node's own config
    // rather than from the `on` prefix. If it were forwarded as a prop instead, native would never
    // report the gesture AND Android's folly::dynamic serializer would crash trying to stringify a
    // function.
    it('routes onRefresh to the native refresh event and never onto the prop bag', async () => {
      let refreshes = 0;
      mount(ROOT_TAG, () => (
        <refresh-control
          refreshing={false}
          onRefresh={() => {
            refreshes++;
          }}
        />
      ));
      await tick();

      expect('onRefresh' in committedControl().payload).toBe(false);
      fabric.fireEvent(createdControl().instanceHandle, 'topRefresh');
      expect(refreshes).toBe(1);
    });

    // why: native reads only `accessibility*`, and the engine folds the web aliases into them off
    // the authored, HYPHENATED names. RefreshControl owns its host element rather than rendering
    // through a View, so nothing else carries the aliases down for it.
    // The fold's own cases: `core/engine/cpp/tests/js/aria-payload.itest.ts`.
    it('forwards the aria aliases under their authored names', async () => {
      mount(ROOT_TAG, () => (
        <refresh-control refreshing={false} aria-label="reload" aria-busy />
      ));
      await tick();

      const props = committedControl().payload;
      expect(props['aria-label']).toBe('reload');
      expect(props['aria-busy']).toBe(true);
    });

    // why: Solid-only, and silent everywhere else. Solid's `spread` walks only the CURRENT keys with
    // no removal pass, so an `aria-label` that goes undefined can leave its key STANDING at the old
    // value — and a screen reader keeps announcing a label the app already removed. React and Vue
    // never meet this: they hand their reconciler a whole new prop object and the engine's diffProps
    // sends the vanished key down as an explicit delete.
    //
    // Read on the AUTHORED key now. The hazard is unchanged and so is the assertion's force — what
    // moved is only which name carries it, since the fold into `accessibilityLabel` is the engine's
    // rule and this harness has no copy of it. If anything this is the sharper place to watch,
    // because it is the key Solid's spread actually holds.
    it('clears an aria alias that goes undefined', async () => {
      const [label, setLabel] = createSignal<string | undefined>('reload');
      mount(ROOT_TAG, () => (
        <refresh-control refreshing={false} aria-label={label()} />
      ));
      await tick();
      expect(committedControl().payload['aria-label']).toBe('reload');

      setLabel(undefined);
      await tick();
      // The failure this guards is the key staying at 'reload'.
      //
      // ABSENT, not null: the literal null was the CLONE PROTOCOL's spelling of "reset to the
      // default", held only inside the diff the stand-in merged. The engine's op stream says the
      // same thing with `NO_VALUE`, and a host replaying that op deletes the key.
      expect(Object.hasOwn(committedControl().payload, 'aria-label')).toBe(
        false,
      );
      // …and the half that proves the engine ACTED: the record carried the label after the mount
      // above, so its being gone from the record means a clearing op was sent for it.
      expect(Object.hasOwn(createdControl().props, 'aria-label')).toBe(false);
    });

    // why: the Android spinner props have no iOS counterpart, so RN forwards them raw and lets each
    // native manager read what it understands. Filtering them in JS would silently disable Android
    // theming while iOS looked fine.
    it('forwards the Android-only spinner props untouched', async () => {
      mount(ROOT_TAG, () => (
        <refresh-control
          refreshing={false}
          colors={['#ff0000']}
          progressBackgroundColor="#ffffff"
          size="large"
          enabled={false}
          progressViewOffset={12}
        />
      ));
      await tick();

      const props = committedControl().payload;
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
        <refresh-control refreshing={false}>
          <view testID="wrapped" />
        </refresh-control>
      ));
      await tick();
      expect(committedControl().children[0]?.payload.testID).toBe('wrapped');
    });
  });

  describe('Negative', () => {
    // why: `onRefresh` is optional in RN — a display-only control (refreshing driven entirely by the
    // parent) must not throw when native reports the gesture with nothing wired.
    it('tolerates a refresh event with no handler', async () => {
      mount(ROOT_TAG, () => <refresh-control refreshing={false} />);
      await tick();
      expect(() => {
        fabric.fireEvent(createdControl().instanceHandle, 'topRefresh');
      }).not.toThrow();
    });
  });
});
