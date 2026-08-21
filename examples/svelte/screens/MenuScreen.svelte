<script lang="ts">
  // Root menu for the @symbiote-native/navigation demo suite: one row per navigator/feature, each
  // pushing its own dedicated demo screen onto the same root Stack. Replaces Canary as the initial
  // route; Canary itself is unchanged (just relocated) and reachable from the first row.
  //
  // Rows are grouped into 6 thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
  // 2-letter badge per line, carried through onto each demo screen's own line tag — so the tour
  // reads as one system instead of a flat bag of unrelated test screens. Svelte twin of
  // examples/vue-sfc/screens/MenuScreen.vue.
  //
  // Whitespace in this markup is free, unlike when the screen was written. The shim maps a
  // whitespace-only text node under a parent that takes no raw text to an anchor, so a gap
  // between siblings never reaches Fabric as an RCTRawText (svelte-adapter-dom-shim §16b), and
  // svelte.config.js's collapseTextWhitespace() folds a sentence wrapped across source lines.
  import {
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
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
  ];
</script>

<SafeAreaView class="screen">
  <ScrollView
    testID="menu-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class="menu-hero">
      <Text class="menu-eyebrow">NAVIGATION DEMO SUITE</Text>
      <Text class="menu-hero-title">Twelve stops along the stack</Text>
      <Text class="menu-hero-subtitle">
        Each row below drives a different line of @symbiote-native/navigation —
        Primitives, Presentation, Structure, Introspection, Routing — on a real
        native stack, plus a Performance stop timing the engine's own commit
        path and a Styling stop showing the whole CSS compiler surface.
      </Text>
    </View>
    {#each MENU_ITEMS as item (item.route)}
      {@const lineInfo = ROUTE_LINE_INFO[item.route]}
      <Pressable
        testID={`menu-row-${item.route}`}
        class={`menu-row menu-row-${lineInfo.line}`}
        onPress={() => navigation.current.push(item.route)}
      >
        <View class={`menu-badge menu-badge-${lineInfo.line}`}>
          <Text class="menu-badge-text">{lineInfo.code}</Text>
        </View>
        <View class="menu-row-copy">
          <Text class="menu-row-label">{item.label}</Text>
          <Text class={`menu-row-hint menu-row-hint-${lineInfo.line}`}>
            {item.hint}
          </Text>
        </View>
      </Pressable>
    {/each}
  </ScrollView>
</SafeAreaView>
