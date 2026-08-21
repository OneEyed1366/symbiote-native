import { Component } from '@angular/core';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from '@symbiote-native/angular';
import { injectStackNavigation } from '@symbiote-native/navigation/angular';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  {
    label: 'All primitives (Canary)',
    route: ROUTE_NAME.Canary,
    hint: 'every @symbiote-native/angular primitive',
  },
  {
    label: 'API Playground',
    route: ROUTE_NAME.ApiPlayground,
    hint: 'signals, control flow, DI, lifecycle, pipes',
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
    hint: 'injectFocusEffect / injectIsFocused / injectNavigationState',
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
    label: 'Reactive style',
    route: ROUTE_NAME.ReactiveStyle,
    hint: 'one tap must repaint every tile',
  },
  {
    label: 'Benchmark',
    route: ROUTE_NAME.Benchmark,
    hint: 'js-framework-benchmark ops + JS-thread FPS',
  },
];

/**
 * Root menu for the demo tour: one row per navigator/feature @symbiote-native/navigation exports.
 * Each row pushes its own dedicated demo screen onto the same root Stack. Replaces Canary as the
 * initial route; Canary itself is unchanged and reachable from the first row. Angular twin of
 * ../../react/screens/MenuScreen.tsx.
 *
 * Rows are grouped into thematic "lines" (navigation-lines.ts's ROUTE_LINE_INFO) — a color +
 * 2-letter badge per line, carried through onto each demo screen's own line tag — so the tour
 * reads as one system instead of a flat bag of unrelated test screens.
 */
@Component({
  selector: 'MenuScreen',
  standalone: true,
  imports: [Pressable, SafeAreaView, ScrollView, Text, View],
  template: `
    <SafeAreaView class="screen">
      <ScrollView
        testID="menu-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class="menu-hero">
          <Text class="menu-eyebrow">NAVIGATION DEMO SUITE</Text>
          <Text class="menu-hero-title">Thirteen stops along the stack</Text>
          <Text class="menu-hero-subtitle">
            Each row below drives a different @symbiote-native/navigation line —
            Primitives, Presentation, Structure, Introspection, Routing — on a
            real native stack, plus a Performance stop timing the engine's own
            commit path and a Styling stop showing the whole CSS compiler
            surface.
          </Text>
        </View>
        @for (item of menuItems; track item.route) {
          <Pressable
            [testID]="'menu-row-' + item.route"
            [class]="rowClass(item)"
            (press)="navigation.push(item.route)"
          >
            <View [class]="badgeClass(item)">
              <Text class="menu-badge-text">{{ lineInfoFor(item).code }}</Text>
            </View>
            <View class="menu-row-copy">
              <Text class="menu-row-label">{{ item.label }}</Text>
              <Text [class]="hintClass(item)">{{ item.hint }}</Text>
            </View>
          </Pressable>
        }
      </ScrollView>
    </SafeAreaView>
  `,
})
export class MenuScreen {
  readonly navigation = injectStackNavigation();

  readonly menuItems = MENU_ITEMS;

  lineInfoFor(item: IMenuItem) {
    return ROUTE_LINE_INFO[item.route];
  }

  rowClass(item: IMenuItem): string {
    return `menu-row menu-row-${this.lineInfoFor(item).line}`;
  }

  badgeClass(item: IMenuItem): string {
    return `menu-badge menu-badge-${this.lineInfoFor(item).line}`;
  }

  hintClass(item: IMenuItem): string {
    return `menu-row-hint menu-row-hint-${this.lineInfoFor(item).line}`;
  }
}
