<!-- Root menu of the demo tour: one row per feature, each pushing its demo screen -->

<!-- Rows share a color and a two-letter badge per line, as `ROUTE_LINE_INFO` sets them -->
<script setup lang="ts">
import { useStackNavigation } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

// The screen is only mounted under a Stack, so the handle has `push` and `pop` directly
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
    label: 'Styling showcase',
    route: ROUTE_NAME.StyleShowcase,
    hint: 'CSS · Modules · SCSS/Less/Stylus — and what is refused',
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
  {
    label: 'Reanimated',
    route: ROUTE_NAME.Reanimated,
    hint: 'spring, derived values, entering and exiting, layout, scroll offset',
  },
];

function lineInfoFor(route: ITourRouteName) {
  return ROUTE_LINE_INFO[route];
}
</script>

<template>
  <safe-area-view class="screen">
    <scroll-view
      testID="menu-scroll"
      class="screen"
      content-container-style="scroll-content"
    >
      <view class="menu-hero">
        <text class="menu-eyebrow"> NAVIGATION DEMO SUITE </text>
        <text class="menu-hero-title"> Thirteen stops along the stack</text>
        <text class="menu-hero-subtitle">
          Ten rows drive a different line of @symbiote-native/navigation —
          Primitives, Presentation, Structure, Introspection, Routing — on a
          real native stack, plus two Performance stops, one timing the commit
          path of the engine and one for Reanimated, and a Styling stop showing
          the whole CSS compiler surface. The remaining stop is Composition:
          Vue's own template/API surface instead.
        </text>
      </view>
      <pressable
        v-for="item in MENU_ITEMS"
        :key="item.route"
        :testID="`menu-row-${item.route}`"
        :class="`menu-row menu-row-${lineInfoFor(item.route).line}`"
        @press="() => navigation.push(item.route)"
      >
        <view :class="`menu-badge menu-badge-${lineInfoFor(item.route).line}`">
          <text class="menu-badge-text">
            {{ lineInfoFor(item.route).code }}
          </text>
        </view>
        <view class="menu-row-copy">
          <text class="menu-row-label">
            {{ item.label }}
          </text>
          <text
            :class="`menu-row-hint menu-row-hint-${lineInfoFor(item.route).line}`"
          >
            {{ item.hint }}
          </text>
        </view>
      </pressable>
    </scroll-view>
  </safe-area-view>
</template>
