// testID must reach the committed native node for EVERY public component — it is the seam Detox
// and other e2e tools match on. A component that drops testID (e.g. by destructuring it off and
// never forwarding) is invisible to e2e. This is the cross-component guard: render each component
// with a unique testID and assert some committed Fabric node carries it. A wrapping component
// (Button -> TouchableOpacity -> Pressable -> View) passes as long as the id lands on its root.
//
// `cases` is the closure: it must list every public visual component exported from
// adapters/react/src/index.ts. TouchableNativeFeedback / VirtualizedSectionList / RefreshControl
// were missing from the original sweep (Android touchable, the SectionList/VirtualizedList tier,
// and the pull-to-refresh primitive respectively) — added here so the guard actually covers the
// full component barrel rather than the components someone remembered to add a case for.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  View,
  Text,
  Modal,
  KeyboardAvoidingView,
  FlatList,
  SectionList,
  VirtualizedList,
  VirtualizedSectionList,
  Animated,
} from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// KeyboardAvoidingView subscribes to the native Keyboard hub on mount; install the minimal fake
// device-event hub + KeyboardObserver the dedicated keyboard tests use so it mounts headless.
// (Harness setup, not part of the testID contract.)
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

const ROOT_TAG = 770;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function carriesTestId(id: string): IFakeNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

// name -> a factory building the element with `testID` set (+ whatever minimal props it needs).
const cases: ReadonlyArray<readonly [string, (id: string) => ReactElement]> = [
  ['View', id => createElement(View, { testID: id })],
  ['Text', id => createElement(Text, { testID: id }, 'x')],
  ['image', id => createElement('image', { testID: id, source: { uri: 'x' } })],
  [
    // The TAG. RN spreads `...props` onto the inner Image (ImageBackground.js:81), so the id lands
    // on the IMAGE rather than the box it is written on — which is what "some committed node
    // carries it" is phrased to allow, and what every wrapper did before the tag.
    'image-background',
    id =>
      createElement(
        'image-background',
        { testID: id, source: { uri: 'x' } },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'scroll-view',
    id =>
      createElement(
        'scroll-view',
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  ['text-input', id => createElement('text-input', { testID: id })],
  ['switch', id => createElement('switch', { testID: id, value: false })],
  [
    // The TAG. RN spreads `...restProps` onto the spinner (ActivityIndicator.js:99), so the id
    // lands on the SPINNER rather than the centering host — which is what "some committed node
    // carries it" is phrased to allow.
    'activity-indicator',
    id => createElement('activity-indicator', { testID: id }),
  ],
  [
    // The TAG, not a component. RN's Button takes no children, so the behavior builds the whole
    // subtree and `testID` stays on the root it is written on.
    'button',
    id => createElement('button', { testID: id, title: 'x' }),
  ],
  [
    'pressable',
    id =>
      createElement('pressable', { testID: id }, createElement(Text, {}, 'x')),
  ],
  [
    'touchable-opacity',
    id =>
      createElement(
        'touchable-opacity',
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'touchable-highlight',
    id =>
      createElement(
        'touchable-highlight',
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    // The other clone-onto-the-child TAG, and the same route as the row below it
    // (TouchableWithoutFeedback.js:153, in the passthrough list rather than the unconditional half).
    'touchable-without-feedback',
    id =>
      createElement(
        'touchable-without-feedback',
        { testID: id },
        createElement(View, {}),
      ),
  ],
  [
    // The TAG, not a component — and the id reaches the committed tree by a different route than
    // every other row here: this tag commits no node, so `testID` lands via the behavior's clone
    // onto the single child (TouchableNativeFeedback.js:389).
    'touchable-native-feedback',
    id =>
      createElement(
        'touchable-native-feedback',
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'safe-area-view',
    id =>
      createElement(
        'safe-area-view',
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'KeyboardAvoidingView',
    id =>
      createElement(
        KeyboardAvoidingView,
        { testID: id },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'Modal',
    id =>
      createElement(
        Modal,
        { testID: id, visible: true },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'input-accessory-view',
    id =>
      createElement(
        'input-accessory-view',
        { testID: id, nativeID: 'acc' },
        createElement(Text, {}, 'x'),
      ),
  ],
  [
    'FlatList',
    id =>
      createElement(FlatList, {
        testID: id,
        data: [1],
        renderItem: (info: { item: unknown }) =>
          createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'SectionList',
    id =>
      createElement(SectionList, {
        testID: id,
        sections: [{ title: 's', data: [1] }],
        renderItem: (info: { item: unknown }) =>
          createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'VirtualizedList',
    id =>
      createElement(VirtualizedList, {
        testID: id,
        data: [1],
        getItem: (data: unknown, index: number) =>
          Array.isArray(data) ? data[index] : undefined,
        getItemCount: (data: unknown) =>
          Array.isArray(data) ? data.length : 0,
        renderItem: (info: { item: unknown }) =>
          createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'VirtualizedSectionList',
    id =>
      createElement(VirtualizedSectionList, {
        testID: id,
        sections: [{ title: 's', data: [1] }],
        renderItem: (info: { item: unknown }) =>
          createElement(Text, {}, String(info.item)),
      }),
  ],
  [
    'refresh-control',
    id => createElement('refresh-control', { testID: id, refreshing: false }),
  ],
  ['Animated.View', id => createElement(Animated.View, { testID: id })],
  ['Animated.Text', id => createElement(Animated.Text, { testID: id }, 'x')],
];

describe('testID reaches the committed native node for every component', () => {
  // Positive only: this is a per-component parity sweep, not a guard clause — there is no
  // rejecting branch (a component either forwards testID or the assertion catches the drop).
  describe('Positive', () => {
    // why: table-driven so adding a new public component to `cases` is the ENTIRE cost of
    // extending the guard — one factory line, not a hand-written test per component.
    for (const [name, build] of cases) {
      it(`${name} forwards testID to Fabric`, () => {
        const id = `tid-${name}`;
        mount(ROOT_TAG, build(id));
        expect(carriesTestId(id)).toBeDefined();
      });
    }
  });
});
