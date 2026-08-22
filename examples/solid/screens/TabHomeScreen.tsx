// Tabs demo · Home tab: the custom tabBarIcon + tabBarActiveTintColor registered on
// TabsDemoScreen's <Tab.Screen>.
//
// createIsFocused, not useIsFocused: it OWNS a signal and two emitter subscriptions, and Solid
// reserves use* for consuming what already exists. It hands back an ACCESSOR, read inside the JSX
// below — this body runs once, so a body-level `const focused = isFocused()` would paint `false`
// forever and never react to the tab switch this screen exists to show.

import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import { createIsFocused } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// A module constant keyed by a literal — nothing to keep reactive.
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

export function TabHomeScreen() {
  const isFocused = createIsFocused();

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>
        <View class="hero-card">
          <View
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR.structure }}
          >
            <Text class="hero-badge-text">TB</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Tabs</Text>
            <Text class="hero-body">
              A bottom-tabs navigator — icon, badge, and tint, each tab a real
              native view.
            </Text>
          </View>
        </View>
        <Text class="info-text">{`focused: ${isFocused()}`}</Text>
      </View>
    </SafeAreaView>
  );
}
