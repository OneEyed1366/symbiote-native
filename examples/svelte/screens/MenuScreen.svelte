<script lang="ts">
  // Root menu of the demo tour: one row per feature, each pushing its demo screen onto the Stack
  // Canary is the first row

  // Rows share a color and a two-letter badge per line, as `ROUTE_LINE_INFO` sets them

  // Whitespace in this markup is free, as the shim turns a whitespace-only text node into an anchor
  // A gap between siblings never reaches Fabric as a raw text node

  // `collapseTextWhitespace()` of svelte.config.js folds a sentence wrapped across source lines
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import type { ITourRouteName } from '../navigation-lines';
  import { ROUTE_LINE_INFO } from '../navigation-lines';

  // This screen is only ever mounted under a Stack (see App.svelte's <Screen name={ROUTE_NAME.Menu}>),
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
      hint: 'every @symbiote-native/svelte primitive',
    },
    {
      label: 'API Playground',
      route: ROUTE_NAME.ApiPlayground,
      hint: 'runes, snippets, stores, context — Svelte 5’s own surface, live',
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
      label: 'Primitive benchmark',
      route: ROUTE_NAME.PrimitiveBench,
      hint: 'the same ops, one primitive at a time',
    },
    {
      label: 'Reanimated',
      route: ROUTE_NAME.Reanimated,
      hint: 'spring, derived values, entering and exiting, layout, scroll offset',
    },
  ];
</script>

<safe-area-view class="screen">
  <scroll-view
    testID="menu-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class="menu-hero">
      <text class="menu-eyebrow">NAVIGATION DEMO SUITE</text>
      <text class="menu-hero-title">Thirteen stops along the stack</text>
      <text class="menu-hero-subtitle">
        Each row below drives a different line of @symbiote-native/navigation —
        Primitives, Presentation, Structure, Introspection, Routing — on a real
        native stack, plus a Performance stop timing the engine's own commit
        path and a Styling stop showing the whole CSS compiler surface.
      </text>
    </view>
    {#each MENU_ITEMS as item (item.route)}
      {@const lineInfo = ROUTE_LINE_INFO[item.route]}
      <pressable
        testID={`menu-row-${item.route}`}
        class={`menu-row menu-row-${lineInfo.line}`}
        p={{ onPress: () => navigation.current.push(item.route) }}
      >
        <view class={`menu-badge menu-badge-${lineInfo.line}`}>
          <text class="menu-badge-text">{lineInfo.code}</text>
        </view>
        <view class="menu-row-copy">
          <text class="menu-row-label">{item.label}</text>
          <text class={`menu-row-hint menu-row-hint-${lineInfo.line}`}>
            {item.hint}
          </text>
        </view>
      </pressable>
    {/each}
  </scroll-view>
</safe-area-view>
