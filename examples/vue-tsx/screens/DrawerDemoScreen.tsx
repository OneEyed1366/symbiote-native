import { defineComponent } from 'vue';
import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/vue';
import type {
  IDrawerContentSlotProps,
  IScreenOptions,
} from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import { ScreenHero } from '../components/ScreenHero';
import { DrawerRecipes } from './drawer/DrawerRecipes';
import { DrawerPanelContext } from './drawer/drawer-panel';
import {
  DEFAULT_DRAWER_SETTINGS,
  drawerPropsOf,
} from './drawer/drawer-settings';
import { usePanelState } from './panel';

export const drawerDemoScreenOptions: IScreenOptions = {
  title: 'Drawer Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

const DRAWER_STYLE = { backgroundColor: '#13243a' };

// `useDrawerNavigation()` reads the handle of the enclosing Drawer from context
const DrawerHomeScreen = defineComponent(
  () => () => (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <ScreenHero
          route={ROUTE_NAME.DrawerDemo}
          title="Drawer"
          body="A swipeable drawer driven by the navigator's own gesture handler. Change its props below and swipe from the chosen edge."
        />
        <DrawerRecipes />
      </view>
    </scroll-view>
  ),
  { name: 'DrawerHomeScreen' },
);

const DrawerSettingsScreen = defineComponent(
  () => {
    const navigation = useDrawerNavigation();
    return () => (
      <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
        <view class="scroll-content">
          <text class="section-label">Drawer demo · Settings</text>
          <ActionButton
            testID="drawer-close-from-settings"
            title="Close drawer"
            onPress={() => navigation.value.closeDrawer()}
            color={LINE_COLOR.structure}
          />
        </view>
      </scroll-view>
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

// The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
export const DrawerDemoScreen = defineComponent(
  () => {
    const panel = usePanelState(DEFAULT_DRAWER_SETTINGS);
    DrawerPanelContext.provide(panel);
    return () => (
      <Drawer
        initialRouteName="Home"
        {...drawerPropsOf(panel.settings.value)}
        drawerStyle={DRAWER_STYLE}
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
    );
  },
  { name: 'DrawerDemoScreen' },
);
