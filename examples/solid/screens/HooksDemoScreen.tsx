// Introspection demo: createFocusEffect bumps a counter every time this screen (re)gains focus and
// stamps the moment it loses it; createIsFocused renders the live true/false; createNavigationState
// selects the whole route-name stack straight out of the root Stack's reducer state. Navigate away
// and back (or push another screen) to watch all three move.
//
// THIS IS NOT A RENAME OF THE REACT/SVELTE SCREEN. Solid splits the navigator's lifecycle surface
// by what each function DOES: `use*` consumes something already on the owner chain (useNavigation /
// useRoute — Solid's own `useContext` sense), `create*` owns a signal, an effect or a subscription.
// All three helpers here own subscriptions, so all three are `create*`, and the two that return
// values return ACCESSORS — called at each use site, never destructured.
//
// createFocusEffect's closure needs no memoization, unlike React's useCallback requirement: a Solid
// body runs ONCE, so the effect is read once and closed over directly. There is no dependency array
// to go stale.
//
// <Index>, not <For>: the list is plain strings and a stack can legitimately hold the same route
// name twice, which <For>'s value-keyed reconciliation cannot tell apart. <Index> keys by position
// and hands the item down as an accessor — the shape a list of primitives wants. It is imported
// explicitly: an un-imported control-flow name resolves against the RENDERER module and reads back
// `undefined`, which builds fine and throws at runtime (.claude/rules/solid-descriptor-bridge.md §3).

import { Index, createSignal } from 'solid-js';
import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import {
  createFocusEffect,
  createIsFocused,
  createNavigationState,
} from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import './HooksDemoScreen.css';

export function HooksDemoScreen() {
  const [focusCount, setFocusCount] = createSignal(0);
  const [lastBlurAt, setLastBlurAt] = createSignal<number | undefined>(
    undefined,
  );
  const isFocused = createIsFocused();
  const routeNames = createNavigationState(state =>
    state.routes.map(route => route.name),
  );
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];

  createFocusEffect(() => {
    setFocusCount(count => count + 1);
    return () => setLastBlurAt(Date.now());
  });

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.introspection }}
          >
            <Text class="hero-badge-text">HK</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Navigation primitives</Text>
            <Text class="hero-body">
              createFocusEffect, createIsFocused and createNavigationState —
              introspecting the navigator's own live state from inside a screen.
            </Text>
          </View>
        </View>
        <Text testID="hooks-is-focused" class="info-text">
          {`createIsFocused(): ${isFocused()}`}
        </Text>
        <Text testID="hooks-focus-count" class="info-text">
          {`createFocusEffect focus count: ${focusCount()}`}
        </Text>
        <Text class="info-text">
          {lastBlurAt() === undefined
            ? 'not blurred yet'
            : `last blurred at ${lastBlurAt()}`}
        </Text>
        <Text class="note-text">
          createNavigationState() · current route stack
        </Text>
        <Index each={routeNames()}>
          {(name, index) => (
            <Text class="hooks-list-row">{`${index}. ${name()}`}</Text>
          )}
        </Index>
      </View>
    </SafeAreaView>
  );
}
