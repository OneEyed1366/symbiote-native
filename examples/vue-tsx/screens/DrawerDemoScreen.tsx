import { defineComponent } from 'vue';
import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/vue';
import type { IDrawerContentSlotProps } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

const drawerLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

// Home/Settings are each mounted under a Drawer, so useDrawerNavigation() hands back the
// Drawer-specific handle (openDrawer/toggleDrawer/closeDrawer/jumpTo) directly — no narrowing.
const DrawerHomeScreen = defineComponent(
  () => {
    const navigation = useDrawerNavigation();
    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <view class={`line-tag line-tag-${drawerLineInfo.line}`}>
            <text class="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.structure }}
            >
              <text class="hero-badge-text">DR</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Drawer</text>
              <text class="hero-body">
                A swipeable drawer sliding in from the right, driven by the
                navigator's own gesture handler.
              </text>
            </view>
          </view>
          <text class="info-text">
            drawerPosition: right · drawerType: slide — swipe from the RIGHT
            edge, or use a button
          </text>
          <ActionButton
            testID="drawer-open"
            title="Open drawer"
            onPress={() => navigation.value.openDrawer()}
            color={LINE_COLOR.structure}
          />
          <ActionButton
            testID="drawer-toggle"
            title="Toggle drawer"
            onPress={() => navigation.value.toggleDrawer()}
            color={LINE_COLOR.structure}
          />
        </view>
      </safe-area-view>
    );
  },
  { name: 'DrawerHomeScreen' },
);

const DrawerSettingsScreen = defineComponent(
  () => {
    const navigation = useDrawerNavigation();
    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <view class={`line-tag line-tag-${drawerLineInfo.line}`}>
            <text class="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</text>
          </view>
          <text class="section-label">Drawer demo · Settings</text>
          <ActionButton
            testID="drawer-close-from-settings"
            title="Close drawer"
            onPress={() => navigation.value.closeDrawer()}
            color={LINE_COLOR.structure}
          />
        </view>
      </safe-area-view>
    );
  },
  { name: 'DrawerSettingsScreen' },
);

function renderDrawerContent({
  state,
  descriptors,
  navigation,
}: IDrawerContentSlotProps) {
  return (
    <safe-area-view testID="drawer-panel" class="section-tight drawer-panel">
      <text class="section-label">Menu</text>
      {state.routes.map(route => (
        <pressable
          key={route.key}
          testID={`drawer-menu-${route.name}`}
          class="menu-row"
          onPress={() => navigation.jumpTo(route.name)}
        >
          <text class="menu-row-label">
            {descriptors[route.key]?.options.drawerLabel ?? route.name}
          </text>
        </pressable>
      ))}
    </safe-area-view>
  );
}

/**
 * Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default
 * drawerPosition ('right') and drawerType ('slide') to prove those props actually flow through
 * to render-drawer.ts's geometry, plus imperative open/toggle/close buttons alongside the swipe
 * gesture. The `drawerContent` scoped slot supplies the menu panel (Drawer ships no built-in
 * one) — Vue's twin of React's renderDrawerContent render PROP.
 */
export const DrawerDemoScreen = defineComponent(
  () => () => (
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      drawerStyle={{ backgroundColor: '#13243a' }}
    >
      {{
        default: () => [
          <Drawer.Screen
            name="Home"
            component={DrawerHomeScreen}
            options={{ title: 'Home', drawerLabel: 'Home' }}
          />,
          <Drawer.Screen
            name="Settings"
            component={DrawerSettingsScreen}
            options={{ title: 'Settings', drawerLabel: 'Settings' }}
          />,
        ],
        drawerContent: renderDrawerContent,
      }}
    </Drawer>
  ),
  { name: 'DrawerDemoScreen' },
);
