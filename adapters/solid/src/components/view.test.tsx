// Solid twin of adapters/react/src/__tests__/view-layout-id.test.tsx and
// adapters/svelte/src/components/view-id-fold.test.ts. Drives REAL compiled Solid JSX through the
// universal renderer into the fake Fabric slot: the Fabric view name, the id -> nativeID fold, the
// onLayout flag, the children pass-through, and the ref hand-back.
//
// Four cases have no counterpart in the React or Svelte files, and they are the point of this
// file. Solid runs a component body ONCE, so "a prop changed after mount", "a child appeared after
// mount", "the host node kept its identity" and "a prop KEY that vanished got cleared" are real,
// silently-breakable claims here rather than tautologies a reconciler makes true for free.
//
// Negative group: a bare string child, which Fabric has no host for outside a <Text>.

import { createSignal, Show } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
import type { IHostInstance } from '../host-instance';
import { mount, unmount } from '../render';
import type { IViewProps } from './view-props';

const ROOT_TAG = 8_201;
const VIEW = 'RCTView';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// Reads the LIVE tree, never the recording — the record holds a node as it was CREATED, with its
// props frozen at that moment, so anything asserted after an update has to come off the live child
// links (symbiote-engine-core §8).
function committed(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

function probe(): ILiveNode {
  const node = committed(n => n.payload.testID === 'probe');
  if (node === undefined)
    throw new Error('no node with testID="probe" was committed');
  return node;
}

describe('Solid View on the engine', () => {
  describe('Positive', () => {
    // why: RN's View is RCTView on iOS — a wrong native view name means the host never resolves a
    // component, which no JS-level check would otherwise catch.
    it('commits as RCTView and forwards ordinary props verbatim', async () => {
      mount(ROOT_TAG, () => (
        <view testID="probe" pointerEvents="box-none" collapsable={false} />
      ));
      await tick();

      expect(probe().viewName).toBe(VIEW);
      expect(probe().payload.pointerEvents).toBe('box-none');
      expect(probe().payload.collapsable).toBe(false);
      // The bag emits `nativeID` on every run so the key set stays stable (see the component's
      // fold comment); an undefined value is deleted by setProp, so nothing leaks to Fabric.
      expect('nativeID' in probe().props).toBe(false);
    });

    // why: `id` is web muscle memory that must NEVER leak to Fabric as a raw prop — RN's own W3C
    // alias maps it to `nativeID`, and a stray `id` key on a real native view manager is undefined
    // behavior on device, not a cosmetic mismatch.
    it('folds a raw id into nativeID and drops the raw id key', async () => {
      mount(ROOT_TAG, () => <view testID="probe" id="foo" />);
      await tick();

      expect(probe().payload.nativeID).toBe('foo');
      expect(probe().payload.id).toBeUndefined();
    });

    // why: when an app supplies both the modern alias and the legacy prop, `id` must win — the
    // precedence RN's own View.js fold implements, so a component migrating from `nativeID` to
    // `id` never silently keeps the stale legacy value.
    it('lets id win over nativeID when both are passed', async () => {
      mount(ROOT_TAG, () => (
        <view testID="probe" id="from-id" nativeID="from-nativeID" />
      ));
      await tick();

      expect(probe().payload.nativeID).toBe('from-id');
    });

    // why: the fold is PER KEY here — the renderer never sees a whole bag — so without the node
    // remembering where its nativeID came from, precedence would be source order and this arm and
    // the one above would disagree. The wrapper hid that; a bare tag does not.
    it('lets id win when nativeID is written FIRST', async () => {
      mount(ROOT_TAG, () => (
        <view testID="probe" nativeID="from-nativeID" id="from-id" />
      ));
      await tick();

      expect(probe().payload.nativeID).toBe('from-id');
    });

    // why: Fabric only measures and fires layout for a node explicitly flagged onLayout:true — an
    // unflagged node's handler silently never fires on a real host. The flag is routeProp's doing,
    // which is exactly why the bag must reach routeProp unsplit.
    it('raises the onLayout flag and never leaks the handler as a prop', async () => {
      mount(ROOT_TAG, () => (
        <view testID="probe" onLayout={() => {}} onPress={() => {}} />
      ));
      await tick();

      expect(probe().payload.onLayout).toBe(true);
      // A function prop reaching Fabric crashes Android's folly::dynamic serializer.
      expect(typeof probe().payload.onPress).not.toBe('function');
    });

    // why: children are the whole reason View exists as a component rather than a prop bag. The
    // user's subtree is passed through the reconciler untouched — never reduced to a Descriptor —
    // so this asserts the real nesting reaches Fabric, string leaf included.
    it('passes a user subtree through to the committed tree', async () => {
      mount(ROOT_TAG, () => (
        <view testID="probe">
          <view testID="inner">
            <text>hi</text>
          </view>
        </view>
      ));
      await tick();

      expect(live.serialize(probe().handle)).toBe(
        'RCTView(RCTView(RCTText(RCTRawText "hi")))',
      );
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the bag accessor
    // precisely so a later change still reaches the host node; one destructure at setup would
    // freeze the View at its mount-time props while every other test in this file still passed.
    it('re-commits the same native node when a prop changes after mount', async () => {
      const [collapsable, setCollapsable] = createSignal(true);
      mount(ROOT_TAG, () => (
        <view testID="probe" collapsable={collapsable()} />
      ));
      await tick();
      // Node IDENTITY rather than a creation count: a rebuild that netted out to the same number
      // of nodes would still satisfy a count, and the identity moving is what the case is about.
      const hostAtMount = probe().handle;
      expect(probe().payload.collapsable).toBe(true);

      setCollapsable(false);
      await tick();

      expect(probe().payload.collapsable).toBe(false);
      expect(probe().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // why: the children accessor is handed to the renderer's `insert`, not read once at setup —
    // a child that only appears later (any <Show>, <For> or conditional) would otherwise never
    // reach the screen, and no static-paint test would notice.
    it('mounts a child that first appears after mount', async () => {
      const [shown, setShown] = createSignal(false);
      mount(ROOT_TAG, () => (
        <view testID="probe">
          <Show when={shown()}>
            <view testID="late" />
          </Show>
        </view>
      ));
      await tick();
      expect(committed(n => n.payload.testID === 'late')).toBeUndefined();

      setShown(true);
      await tick();

      expect(committed(n => n.payload.testID === 'late')).toBeDefined();
    });

    // why: Solid's spread walks only the CURRENT key set and has no removal pass, so a prop that
    // goes undefined can leave its key STANDING at the old value — and a screen reader keeps
    // announcing a label the app already removed, green in every other test here.
    //
    // Read on the AUTHORED key: the fold into `accessibilityLabel` is the engine's rule
    // (`aria-payload.itest.ts`) and this harness holds no copy of it. The hazard is unchanged, and
    // `aria-label` is the key Solid's spread actually holds, so this is the sharper place to watch.
    it('clears an aria alias that goes undefined', async () => {
      const [label, setLabel] = createSignal<string | undefined>('wifi');
      mount(ROOT_TAG, () => <view testID="probe" aria-label={label()} />);
      await tick();
      expect(probe().payload['aria-label']).toBe('wifi');

      setLabel(undefined);
      await tick();

      // The claim is that the key is CLEARED, and it is read in two places because one of them
      // alone would pass for the wrong reason.
      //
      // `null` is not the spelling any more, and that is a correction rather than a weakening. The
      // literal null was the CLONE PROTOCOL's way of saying "reset this to its default" — it only
      // ever existed in the diff the stand-in merged. The engine's op stream says the same thing
      // with `NO_VALUE`, and the recording, replaying that op, DELETES the key. So "absent" is what
      // the engine actually emits.
      expect(Object.hasOwn(probe().payload, 'aria-label')).toBe(false);
      // …and this is the half that proves the engine ACTED. Had it simply stopped setting the key,
      // the record would still carry the value from the first commit; the key being gone from the
      // record means a clearing op was sent for it.
      const recorded = fabric.find(node => node.props.testID === 'probe');
      expect(Object.hasOwn(recorded?.props ?? {}, 'aria-label')).toBe(false);
    });

    // why: `ref` on a COMPONENT is rewritten by Solid's compiler into a callback prop, so the
    // adapter's only job is to call it with the host node. If it were treated as a React-style
    // object (or forwarded into the prop bag) the caller would get nothing back, and every
    // imperative interop path — findNodeHandle, measure, setNativeProps — would dead-end.
    it('hands the committed host instance to a ref', async () => {
      // A signal setter rather than the `ref={el}` variable form: the compiler turns BOTH into the
      // same callback prop, and holding the node in a signal is the shape host-instance.ts's
      // findNodeHandle documents an accessor unwrap for — so this covers the interop path too.
      const [node, setNode] = createSignal<IHostInstance | undefined>();
      mount(ROOT_TAG, () => <view testID="probe" ref={setNode} />);
      await tick();

      expect(node()).toBeDefined();
      expect(typeof node()?.measure).toBe('function');
      // The ref hands back the very engine node the tree holds — node identity, the half of this
      // claim readable without a renderer. That `findNodeHandle` then resolves it to the TAG Fabric
      // committed is a number no stand-in can produce, and lives in
      // `core/engine/cpp/tests/js/solid-adapter.itest.tsx` against the real engine.
      expect(node()).toBe(probe().handle);

      // Type-level pin, no runtime claim. IViewProps['ref'] is solid-js's `Ref` UNION rather than
      // a callback because type-checking happens on what the author wrote — `ref={el}`, a plain
      // variable, is the common Solid idiom and a callback-only signature would reject it before
      // the compiler ever rewrites it. Pinned here instead of written as `ref={el}` because
      // eslint's no-unassigned-vars cannot see that rewrite.
      const acceptedRefShapes: Array<IViewProps['ref']> = [setNode, node()];
      expect(acceptedRefShapes).toHaveLength(2);
    });
  });

  describe('Negative', () => {
    // why: Fabric has no bare-text host — RCTRawText is only valid inside a <Text>. Failing loudly
    // at insert beats building an invalid tree that dies deeper in native with a far less legible
    // error. `children` is typed as JSX.Element, which legitimately includes a string, so this is
    // reachable without violating IViewProps.
    it('throws when a bare string is rendered as a View child', () => {
      expect(() =>
        mount(ROOT_TAG, () => <view testID="probe">oops</view>),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });
});
