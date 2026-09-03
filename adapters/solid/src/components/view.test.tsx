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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { findNodeHandle } from '../host-instance';
import type { IHostInstance } from '../host-instance';
import { mount, unmount } from '../render';
import { Text } from './text';
import { View, type IViewProps } from './view';

const ROOT_TAG = 8_201;
const VIEW = 'RCTView';

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

// Reads the LIVE committed tree, never `fabric.created` — a created node's props are frozen at
// first commit, so anything asserted after an update has to come off the committed child set
// (symbiote-engine-core §8).
function committed(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (found === undefined && predicate(node)) found = node;
  });
  return found;
}

function probe(): IFakeNode {
  const node = committed(n => n.props.testID === 'probe');
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
        <View testID="probe" pointerEvents="box-none" collapsable={false} />
      ));
      await tick();

      expect(probe().viewName).toBe(VIEW);
      expect(probe().props.pointerEvents).toBe('box-none');
      expect(probe().props.collapsable).toBe(false);
      // The bag emits `nativeID` on every run so the key set stays stable (see the component's
      // fold comment); an undefined value is deleted by setProp, so nothing leaks to Fabric.
      expect('nativeID' in probe().props).toBe(false);
    });

    // why: `id` is web muscle memory that must NEVER leak to Fabric as a raw prop — RN's own W3C
    // alias maps it to `nativeID`, and a stray `id` key on a real native view manager is undefined
    // behavior on device, not a cosmetic mismatch.
    it('folds a raw id into nativeID and drops the raw id key', async () => {
      mount(ROOT_TAG, () => <View testID="probe" id="foo" />);
      await tick();

      expect(probe().props.nativeID).toBe('foo');
      expect(probe().props.id).toBeUndefined();
    });

    // why: when an app supplies both the modern alias and the legacy prop, `id` must win — the
    // precedence RN's own View.js fold implements, so a component migrating from `nativeID` to
    // `id` never silently keeps the stale legacy value.
    it('lets id win over nativeID when both are passed', async () => {
      mount(ROOT_TAG, () => (
        <View testID="probe" id="from-id" nativeID="from-nativeID" />
      ));
      await tick();

      expect(probe().props.nativeID).toBe('from-id');
    });

    // why: Fabric only measures and fires layout for a node explicitly flagged onLayout:true — an
    // unflagged node's handler silently never fires on a real host. The flag is routeProp's doing,
    // which is exactly why the bag must reach routeProp unsplit.
    it('raises the onLayout flag and never leaks the handler as a prop', async () => {
      mount(ROOT_TAG, () => (
        <View testID="probe" onLayout={() => {}} onPress={() => {}} />
      ));
      await tick();

      expect(probe().props.onLayout).toBe(true);
      // A function prop reaching Fabric crashes Android's folly::dynamic serializer.
      expect(typeof probe().props.onPress).not.toBe('function');
    });

    // why: children are the whole reason View exists as a component rather than a prop bag. The
    // user's subtree is passed through the reconciler untouched — never reduced to a Descriptor —
    // so this asserts the real nesting reaches Fabric, string leaf included.
    it('passes a user subtree through to the committed tree', async () => {
      mount(ROOT_TAG, () => (
        <View testID="probe">
          <View testID="inner">
            <Text>hi</Text>
          </View>
        </View>
      ));
      await tick();

      expect(fabric.serialize([probe()])).toBe(
        'RCTView(RCTView(RCTText(RCTRawText "hi")))',
      );
    });

    // why: Solid runs a component body ONCE. Every prop read sits inside the bag accessor
    // precisely so a later change still reaches the host node; one destructure at setup would
    // freeze the View at its mount-time props while every other test in this file still passed.
    it('re-commits the same native node when a prop changes after mount', async () => {
      const [collapsable, setCollapsable] = createSignal(true);
      mount(ROOT_TAG, () => (
        <View testID="probe" collapsable={collapsable()} />
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(probe().props.collapsable).toBe(true);

      setCollapsable(false);
      await tick();

      expect(probe().props.collapsable).toBe(false);
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: the children accessor is handed to the renderer's `insert`, not read once at setup —
    // a child that only appears later (any <Show>, <For> or conditional) would otherwise never
    // reach the screen, and no static-paint test would notice.
    it('mounts a child that first appears after mount', async () => {
      const [shown, setShown] = createSignal(false);
      mount(ROOT_TAG, () => (
        <View testID="probe">
          <Show when={shown()}>
            <View testID="late" />
          </Show>
        </View>
      ));
      await tick();
      expect(committed(n => n.props.testID === 'late')).toBeUndefined();

      setShown(true);
      await tick();

      expect(committed(n => n.props.testID === 'late')).toBeDefined();
    });

    // why: Solid's spread walks only the CURRENT key set and has no removal pass, and
    // resolveAccessibilityProps emits `accessibilityLabel` only while an aria alias holds a VALUE.
    // Without the stable-key widening the folded key simply vanishes from the bag and a screen
    // reader keeps announcing a label the app already removed — green in every other test here.
    it('clears a folded accessibility prop when its aria alias goes undefined', async () => {
      const [label, setLabel] = createSignal<string | undefined>('wifi');
      mount(ROOT_TAG, () => <View testID="probe" aria-label={label()} />);
      await tick();
      expect(probe().props.accessibilityLabel).toBe('wifi');

      setLabel(undefined);
      await tick();

      // `null`, not absent: a key the node held last commit and no longer has is sent to Fabric as
      // literal null so the native setter resets to its default (diffProps, symbiote-engine-core
      // §8) — which is precisely the behaviour React and Vue get for free and the widening
      // restores here. Without it the assertion reads back the stale 'wifi'.
      expect(probe().props.accessibilityLabel).toBeNull();
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
      mount(ROOT_TAG, () => <View testID="probe" ref={setNode} />);
      await tick();

      expect(node()).toBeDefined();
      expect(typeof node()?.measure).toBe('function');
      expect(findNodeHandle(node)).toBe(probe().tag);

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
        mount(ROOT_TAG, () => <View testID="probe">oops</View>),
      ).toThrow(/must be rendered inside a <Text>/);
    });
  });
});
