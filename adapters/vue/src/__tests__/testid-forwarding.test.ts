// testID must reach the committed native node for EVERY public Vue component — it is the seam Detox
// matches on, and the Vue path adds risk the React path lacks: attrs arrive untyped and run through
// normalizeVueAttrs, and a component's forwardAttrs allow-list could drop testID. This is the Vue
// twin of the React testid-forwarding guard: render each component with a unique testID and assert
// some committed Fabric node carries it (a wrapper like Button -> TouchableOpacity passes as long as
// the id lands on its root).
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
  View,
  Text,
  Image,
  ImageBackground,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Button,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TouchableNativeFeedback,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  InputAccessoryView,
  FlatList,
  SectionList,
  VirtualizedList,
  VirtualizedSectionList,
  RefreshControl,
  Animated,
} from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// KeyboardAvoidingView subscribes to the native Keyboard hub in onMounted; without a device-event
// hub that throws before the commit, so install the minimal fake hub + KeyboardObserver the
// dedicated keyboard tests use. (This is harness setup, not part of the testID contract.)
const fakeKeyboardObserver = { addListener: (): void => {}, removeListeners: (): void => {} };
const fakeModules: Record<string, unknown> = { KeyboardObserver: fakeKeyboardObserver };
Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown => fakeModules[name] ?? null,
  RN$registerCallableModule: (): void => {},
});

const ROOT_TAG = 780;
const fabric = installFabric();

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function carriesTestId(id: string): IFakeNode | undefined {
  return fabric.find(node => node.props.testID === id);
}

const textChild = (): VNode[] => [h(Text, null, 'x')];

// name -> a factory building the VNode with `testID` set (+ whatever minimal props it needs).
const cases: ReadonlyArray<readonly [string, (id: string) => VNode]> = [
  ['View', id => h(View, { testID: id })],
  ['Text', id => h(Text, { testID: id }, 'x')],
  ['Image', id => h(Image, { testID: id, source: { uri: 'x' } })],
  ['ImageBackground', id => h(ImageBackground, { testID: id, source: { uri: 'x' } }, textChild)],
  ['ScrollView', id => h(ScrollView, { testID: id }, textChild)],
  ['TextInput', id => h(TextInput, { testID: id })],
  ['Switch', id => h(Switch, { testID: id, value: false })],
  ['ActivityIndicator', id => h(ActivityIndicator, { testID: id })],
  ['Button', id => h(Button, { testID: id, title: 'x' })],
  ['Pressable', id => h(Pressable, { testID: id }, textChild)],
  ['TouchableOpacity', id => h(TouchableOpacity, { testID: id }, textChild)],
  ['TouchableHighlight', id => h(TouchableHighlight, { testID: id }, textChild)],
  ['TouchableWithoutFeedback', id => h(TouchableWithoutFeedback, { testID: id }, () => [h(View)])],
  ['TouchableNativeFeedback', id => h(TouchableNativeFeedback, { testID: id }, textChild)],
  ['SafeAreaView', id => h(SafeAreaView, { testID: id }, textChild)],
  ['KeyboardAvoidingView', id => h(KeyboardAvoidingView, { testID: id }, textChild)],
  ['Modal', id => h(Modal, { testID: id, visible: true }, textChild)],
  ['InputAccessoryView', id => h(InputAccessoryView, { testID: id, nativeID: 'acc' }, textChild)],
  [
    // The cell renderer is a Vue scoped slot (#item), not a renderItem prop — passing renderItem
    // as a prop here would silently no-op (it falls into the untyped attrs passthrough), so it
    // would prove nothing about real usage even though the root node would still carry testID.
    'FlatList',
    id =>
      h(
        FlatList,
        { testID: id, data: [1] },
        { item: (info: { item: unknown }) => [h(Text, null, String(info.item))] },
      ),
  ],
  [
    'SectionList',
    id =>
      h(
        SectionList,
        { testID: id, sections: [{ title: 's', data: [1] }] },
        { item: (info: { item: unknown }) => [h(Text, null, String(info.item))] },
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
          getItemCount: (data: unknown) => (Array.isArray(data) ? data.length : 0),
        },
        { item: (info: { item: unknown }) => [h(Text, null, String(info.item))] },
      ),
  ],
  [
    'VirtualizedSectionList',
    id =>
      h(
        VirtualizedSectionList,
        { testID: id, sections: [{ title: 's', data: [1] }] },
        { item: (info: { item: unknown }) => [h(Text, null, String(info.item))] },
      ),
  ],
  ['RefreshControl', id => h(RefreshControl, { testID: id, refreshing: false })],
  ['Animated.View', id => h(Animated.View, { testID: id })],
  ['Animated.Text', id => h(Animated.Text, { testID: id }, 'x')],
  ['Animated.Image', id => h(Animated.Image, { testID: id, source: { uri: 'x' } })],
  // Animated.ScrollView is a LAZY memoized getter (deferred past module init to dodge a TDZ
  // cycle with ScrollView's own sticky-header import of this Animated namespace) — worth its own
  // case since a broken getter would be invisible to any test that only touches Animated.View/Text.
  ['Animated.ScrollView', id => h(Animated.ScrollView, { testID: id }, textChild)],
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
