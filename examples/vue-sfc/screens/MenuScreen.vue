<!--
  Root menu for the @symbiote-native/navigation demo suite: one row per navigator/feature, each
  pushing its own dedicated demo screen onto the same root Stack. Replaces Canary as the initial
  route; Canary itself is unchanged (just relocated) and reachable from the first row.

  Rows are grouped into 7 thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +  2-letter badge per line, carried through onto each demo screen's own line tag — so the tour
  reads as one system instead of a flat bag of unrelated test screens. Five of the lines are
  @symbiote-native/navigation itself; the sixth (Composition, the API Playground row) is Vue's own
  template/API surface — no navigation package involved, still wearing the same wayfinding
  language. Vue SFC twin of .examples/react/screens/MenuScreen.tsx.
-->
<script setup lang="ts">
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/vue';
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

// This screen is only ever mounted under a Stack (see App.vue's <Screen :name="ROUTE_NAME.Menu">),
// so useStackNavigation() hands back the Stack-specific handle (push/pop/…) directly — no union
// narrowing.
const navigation = useStackNavigation();

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  {
    label: 'All primitives (Canary)',
    route: ROUTE_NAME.Canary,
    hint: 'every @symbiote-native/vue primitive',
  },
  {
    label: 'API Playground',
    route: ROUTE_NAME.ApiPlayground,
    hint: "v-show, KeepAlive, Suspense, provide/inject — Vue's own API surface",
  },
  {
    label: 'Header options',
    route: ROUTE_NAME.HeaderOptions,
    hint: 'bar buttons, menu, search bar, large title',
  },
  {
    label: 'Sheet presentation',
    route: ROUTE_NAME.SheetDemo,
    hint: 'formSheet + multiple detents',
  },
  {
    label: 'Tabs',
    route: ROUTE_NAME.TabsDemo,
    hint: 'bottom-tabs — icon, badge, tint',
  },
  {
    label: 'Drawer',
    route: ROUTE_NAME.DrawerDemo,
    hint: 'swipeable drawer — right side, slide type',
  },
  {
    label: 'Nested navigators',
    route: ROUTE_NAME.NestedNavigators,
    hint: 'Tab nested in a Stack screen + getParent()',
  },
  {
    label: 'Hooks',
    route: ROUTE_NAME.HooksDemo,
    hint: 'useFocusEffect / useIsFocused / useNavigationState',
  },
  {
    label: 'Deep linking',
    route: ROUTE_NAME.DeepLinking,
    hint: 'resolveRouteFromUrl against a typed URL',
  },
  {
    label: 'State persistence',
    route: ROUTE_NAME.StatePersistence,
    hint: 'serialize/deserialize the Stack state',
  },
  {
    label: 'Benchmark',
    route: ROUTE_NAME.Benchmark,
    hint: 'js-framework-benchmark ops + JS-thread FPS',
  },
];

function lineInfoFor(route: ITourRouteName) {
  return ROUTE_LINE_INFO[route];
}
</script>

<template>
  <SafeAreaView class="screen">
    <ScrollView
      testID="menu-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <View class="menu-hero">
        <Text class="menu-eyebrow">NAVIGATION DEMO SUITE</Text>
        <Text class="menu-hero-title">Eleven stops along the stack</Text>
        <Text class="menu-hero-subtitle"
          >Ten rows drive a different line of @symbiote-native/navigation —
          Primitives, Presentation, Structure, Introspection, Routing — on a
          real native stack, plus a Performance stop timing the engine's own
          commit path. The remaining stop is Composition: Vue's own template/API
          surface instead.</Text
        >
      </View>
      <Pressable
        v-for="item in MENU_ITEMS"
        :key="item.route"
        :testID="`menu-row-${item.route}`"
        :class="`menu-row menu-row-${lineInfoFor(item.route).line}`"
        @press="() => navigation.push(item.route)"
      >
        <View :class="`menu-badge menu-badge-${lineInfoFor(item.route).line}`">
          <Text class="menu-badge-text">{{
            lineInfoFor(item.route).code
          }}</Text>
        </View>
        <View class="menu-row-copy">
          <Text class="menu-row-label">{{ item.label }}</Text>
          <Text
            :class="`menu-row-hint menu-row-hint-${lineInfoFor(item.route).line}`"
            >{{ item.hint }}</Text
          >
        </View>
      </Pressable>
    </ScrollView>
  </SafeAreaView>
</template>
