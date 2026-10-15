import { useStackNavigation } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  {
    label: 'All primitives (Canary)',
    route: ROUTE_NAME.Canary,
    hint: 'every @symbiote-native/react primitive',
  },
  {
    label: 'API Playground',
    route: ROUTE_NAME.ApiPlayground,
    hint: 'React hooks, Suspense, Context, refs, error boundaries — live',
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
    label: 'JSI navigation cost',
    route: ROUTE_NAME.JsiNavigationCost,
    hint: 'prices one host-navigation query across the JSI boundary',
  },
  {
    label: 'Reanimated',
    route: ROUTE_NAME.Reanimated,
    hint: 'spring, CSS animations and transitions, :active, entering and exiting',
  },
];

/**
 * Root menu for the @symbiote-native/navigation demo surface: one row per navigator/feature,
 * each pushing its own dedicated demo screen onto the same root Stack. Replaces Canary as the
 * initial route; Canary itself is unchanged and reachable from the first row.
 *
 * Rows are grouped into lines (`ROUTE_LINE_INFO`), a color and a badge each
 * API Playground is no navigation row, it sits on the Introspection line beside HooksDemo
 */
export function MenuScreen() {
  const navigation = useStackNavigation();
  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="menu-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className="menu-hero">
          <text className="menu-eyebrow">NAVIGATION DEMO SUITE</text>
          <text className="menu-hero-title">Twelve stops along the stack</text>
          <text className="menu-hero-subtitle">
            Each row below drives a different line of
            @symbiote-native/navigation — Primitives, Presentation, Structure,
            Introspection, Routing — on a real native stack, plus a Performance
            stop timing the engine's own commit path and a Styling stop showing
            the whole CSS compiler surface.
          </text>
        </view>
        {MENU_ITEMS.map(item => {
          const lineInfo = ROUTE_LINE_INFO[item.route];
          return (
            <pressable
              key={item.route}
              testID={`menu-row-${item.route}`}
              className={`menu-row menu-row-${lineInfo.line}`}
              onPress={() => navigation.push(item.route)}
            >
              <view className={`menu-badge menu-badge-${lineInfo.line}`}>
                <text className="menu-badge-text">{lineInfo.code}</text>
              </view>
              <view className="menu-row-copy">
                <text className="menu-row-label">{item.label}</text>
                <text
                  className={`menu-row-hint menu-row-hint-${lineInfo.line}`}
                >
                  {item.hint}
                </text>
              </view>
            </pressable>
          );
        })}
      </scroll-view>
    </safe-area-view>
  );
}
