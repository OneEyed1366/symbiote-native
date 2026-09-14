// testID must reach the committed native node for EVERY public Vue component — it is the seam Detox
// matches on, and the Vue path adds risk the React path lacks: attrs arrive untyped and run through
// normalizeVueAttrs, and a component's forwardAttrs allow-list could drop testID. This is the Vue
// twin of the React testid-forwarding guard: render each component with a unique testID and assert
// some committed Fabric node carries it (a tag whose behavior clones onto a child, like
// touchable-native-feedback, passes as long as the id lands somewhere in the committed subtree).
//
// `cases` is the closure: it must list every public visual component exported from
// adapters/vue/src/index.ts. TouchableNativeFeedback / VirtualizedSectionList / RefreshControl were
// missing from the original sweep (same gap the React twin's own history records) — added here so
// the guard actually covers the full component barrel, not just the components someone remembered
// to add a case for.

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  Modal,
  KeyboardAvoidingView,
  FlatList,
  SectionList,
  VirtualizedList,
  VirtualizedSectionList,
  Animated,
} from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// KeyboardAvoidingView subscribes to the native Keyboard hub in onMounted; without a device-event
// hub that throws before the commit, so install the minimal fake hub + KeyboardObserver the
// dedicated keyboard tests use. (This is harness setup, not part of the testID contract.)
const fakeKeyboardObserver = {
  addListener: (): void => {},
  removeListeners: (): void => {},
};
const fakeModules: Record<string, unknown> = {
  KeyboardObserver: fakeKeyboardObserver,
};
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => fakeModules[name] ?? null,
  RN$registerCallableModule: (): void => {},
});

const ROOT_TAG = 780;
const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function carriesTestId(id: string): IFakeNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

// A TAG child. Children reach an element as an ARRAY; only the list components below, which are
// real Vue components, take this as a slot function.
const textChild = (): VNode[] => [h('text', null, 'x')];

// name -> a factory building the VNode with `testID` set (+ whatever minimal props it needs).
const cases: ReadonlyArray<readonly [string, (id: string) => VNode]> = [
  ['view', id => h('view', { testID: id })],
  ['text', id => h('text', { testID: id }, 'x')],
  // The TAG. `registerImageBehavior` folds `source` on the node itself, so the id stays where it
  // is written.
  ['image', id => h('image', { testID: id, source: { uri: 'x' } })],
  [
    // The TAG. RN spreads `...props` onto the inner Image (ImageBackground.js:81), so the id lands
    // on the IMAGE rather than the box it is written on — which is what "some committed node
    // carries it" is phrased to allow, and what every wrapper did before the tag.
    'image-background',
    id =>
      h('image-background', { testID: id, source: { uri: 'x' } }, textChild()),
  ],
  ['scroll-view', id => h('scroll-view', { testID: id }, textChild())],
  ['text-input', id => h('text-input', { testID: id })],
  ['switch', id => h('switch', { testID: id, value: false })],
  [
    // The TAG. RN spreads `...restProps` onto the spinner (ActivityIndicator.js:99), so the id
    // lands on the SPINNER rather than the centering host — which is what "some committed node
    // carries it" is phrased to allow.
    'activity-indicator',
    id => h('activity-indicator', { testID: id }),
  ],
  [
    // The TAG, not a component. RN's Button takes no children, so the behavior builds the whole
    // subtree and `testID` stays on the root it is written on.
    'button',
    id => h('button', { testID: id, title: 'x' }),
  ],
  ['pressable', id => h('pressable', { testID: id }, textChild())],
  [
    // The TAG — one node, no clone-onto-child, unlike TouchableHighlight below.
    'touchable-opacity',
    id => h('touchable-opacity', { testID: id }, textChild()),
  ],
  [
    // The TAG. Both style halves fold onto this one node; the child is untouched, so the id stays
    // where it is written regardless.
    'touchable-highlight',
    id => h('touchable-highlight', { testID: id }, textChild()),
  ],
  [
    // The other clone-onto-the-child TAG, and the same route as the row below it
    // (TouchableWithoutFeedback.js:153, in the passthrough list rather than the unconditional half).
    'touchable-without-feedback',
    id => h('touchable-without-feedback', { testID: id }, [h('view')]),
  ],
  [
    // The TAG, not a component — and the id reaches the committed tree by a different route than
    // every other row here: this tag commits no node, so `testID` lands via the behavior's clone
    // onto the single child (TouchableNativeFeedback.js:389).
    'touchable-native-feedback',
    id => h('touchable-native-feedback', { testID: id }, textChild()),
  ],
  // The TAG. Children go to an element as an ARRAY, never a slot function — an element ignores
  // slot children entirely and renders nothing.
  ['safe-area-view', id => h('safe-area-view', { testID: id }, textChild())],
  [
    'KeyboardAvoidingView',
    id => h(KeyboardAvoidingView, { testID: id }, textChild),
  ],
  ['Modal', id => h(Modal, { testID: id, visible: true }, textChild)],
  [
    // The TAG, children as an array — see `safe-area-view` above.
    'input-accessory-view',
    id =>
      h('input-accessory-view', { testID: id, nativeID: 'acc' }, textChild()),
  ],
  [
    // The cell renderer is a Vue scoped slot (#item), not a renderItem prop — passing renderItem
    // as a prop here would silently no-op (it falls into the untyped attrs passthrough), so it
    // would prove nothing about real usage even though the root node would still carry testID.
    'FlatList',
    id =>
      h(
        FlatList,
        { testID: id, data: [1] },
        {
          item: (info: { item: unknown }) => [
            h('text', null, String(info.item)),
          ],
        },
      ),
  ],
  [
    'SectionList',
    id =>
      h(
        SectionList,
        { testID: id, sections: [{ title: 's', data: [1] }] },
        {
          item: (info: { item: unknown }) => [
            h('text', null, String(info.item)),
          ],
        },
      ),
  ],
  [
    'VirtualizedList',
    id =>
      h(
        VirtualizedList,
        {
          testID: id,
          data: [1],
          getItem: (data: unknown, index: number) =>
            Array.isArray(data) ? data[index] : undefined,
          getItemCount: (data: unknown) =>
            Array.isArray(data) ? data.length : 0,
        },
        {
          item: (info: { item: unknown }) => [
            h('text', null, String(info.item)),
          ],
        },
      ),
  ],
  [
    'VirtualizedSectionList',
    id =>
      h(
        VirtualizedSectionList,
        { testID: id, sections: [{ title: 's', data: [1] }] },
        {
          item: (info: { item: unknown }) => [
            h('text', null, String(info.item)),
          ],
        },
      ),
  ],
  [
    // The TAG — `registerRefreshControlBehavior` owns the controlled-spinner handshake.
    'refresh-control',
    id => h('refresh-control', { testID: id, refreshing: false }),
  ],
  ['Animated.View', id => h(Animated.View, { testID: id })],
  ['Animated.Text', id => h(Animated.Text, { testID: id }, 'x')],
  [
    'Animated.Image',
    id => h(Animated.Image, { testID: id, source: { uri: 'x' } }),
  ],
  // Animated.ScrollView is a LAZY memoized getter (deferred past module init to dodge a TDZ
  // cycle with ScrollView's own sticky-header import of this Animated namespace) — worth its own
  // case since a broken getter would be invisible to any test that only touches Animated.View/Text.
  [
    'Animated.ScrollView',
    id => h(Animated.ScrollView, { testID: id }, textChild),
  ],
];

// Positive only: forwarding testID has no rejecting/throwing path (every component either has an
// attrs allow-list that includes it or falls through the untyped-passthrough bucket), so there is
// no Negative group here — a component silently dropping testID is a coverage gap in THIS list, not
// a runtime error the component itself could throw.
describe('testID reaches the committed native node for every Vue component', () => {
  for (const [name, build] of cases) {
    // why: Detox and other e2e tooling select elements by testID against the COMMITTED Fabric
    // tree; a wrapper that destructures testID off attrs without forwarding it (or an allow-list
    // that omits it) makes the component invisible to e2e even though it renders correctly.
    it(`${name} forwards testID to Fabric`, async () => {
      const id = `tid-${name}`;
      mount(ROOT_TAG, defineComponent({ setup: () => () => build(id) }));
      await tick();
      expect(carriesTestId(id)).toBeDefined();
    });
  }
});
