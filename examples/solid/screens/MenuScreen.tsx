// Root menu for the @symbiote-native/navigation demo suite: one row per navigator/feature, each
// pushing its own screen onto the same root Stack. Rows are grouped into 7 thematic "lines"
// (navigation-lines.ts's ROUTE_LINE_INFO) — a color + 2-letter badge per line, carried onto each
// demo screen's own line tag — so the tour reads as one system rather than a bag of test screens.
//
// The rows come from routes.ts's MENU_ROWS, not from JSX: a new demo screen is one array entry plus
// one <Stack.Screen> marker, never an edit in here.
//
// <For> is imported explicitly. An un-imported control-flow name resolves against the RENDERER
// module and reads back `undefined`, which builds fine and throws at runtime
// (.claude/rules/solid-descriptor-bridge.md §3).

import { For } from 'solid-js';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/solid';
import { useStackNavigation } from '@symbiote-native/navigation/solid';
import { MENU_ROWS } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import './MenuScreen.css';

export function MenuScreen() {
  // An ACCESSOR, not a handle: this screen's body runs once, and a nested navigator can re-scope
  // the owner chain underneath it. Called at each use site, never destructured.
  const navigation = useStackNavigation();

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="menu-scroll"
        class="screen"
        contentContainerStyle="menu-content"
      >
        <View class="menu-hero">
          <Text class="menu-eyebrow">NAVIGATION DEMO SUITE</Text>
          <Text class="menu-hero-title">Twelve stops along the stack</Text>
          <Text class="menu-hero-subtitle">
            Each row below drives a different line of
            @symbiote-native/navigation — Primitives, Presentation, Structure,
            Introspection, Routing — on a real native stack, plus a Performance
            stop timing the engine's own commit path and a Styling stop showing
            the whole CSS compiler surface.
          </Text>
        </View>

        <For each={MENU_ROWS}>
          {row => {
            // Safe as a plain const: <For>'s map fn runs once per key under its own root, and
            // MENU_ROWS is a module constant, so there is nothing here to keep reactive.
            const lineInfo = ROUTE_LINE_INFO[row.route];
            return (
              <Pressable
                testID={`menu-row-${row.route}`}
                class={`menu-row menu-row-${lineInfo.line}`}
                onPress={() => navigation().push(row.route)}
              >
                <View class={`menu-badge menu-badge-${lineInfo.line}`}>
                  <Text class="menu-badge-text">{lineInfo.code}</Text>
                </View>
                <View class="menu-row-copy">
                  <Text class="menu-row-label">{row.label}</Text>
                  <Text class={`menu-row-hint menu-row-hint-${lineInfo.line}`}>
                    {row.blurb}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        </For>
      </ScrollView>
    </SafeAreaView>
  );
}
