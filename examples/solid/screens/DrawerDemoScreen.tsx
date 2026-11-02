import { For } from 'solid-js';
import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/solid';
import type { Accessor } from 'solid-js';
import type {
  IDrawerContentSlotProps,
  IDrawerScreenOptions,
  ISolidScreenOptions,
} from '@symbiote-native/navigation/solid';
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
import { createPanelState } from './panel';

export const drawerDemoScreenOptions: ISolidScreenOptions = {
  title: 'Drawer Demo',
  headerShown: true,
  headerTintColor: LINE_COLOR.structure,
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: '#0b1622' },
  headerUserInterfaceStyle: 'dark',
};

const DRAWER_STYLE = { backgroundColor: '#13243a' };

const homeOptions: IDrawerScreenOptions = {
  title: 'Home',
  drawerLabel: 'Home',
};

const settingsOptions: IDrawerScreenOptions = {
  title: 'Settings',
  drawerLabel: 'Settings',
};

// `useDrawerNavigation()` reads the handle of the enclosing Drawer from context
function DrawerHomeScreen() {
  return (
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
  );
}

function DrawerSettingsScreen() {
  const navigation = useDrawerNavigation();
  return (
    <scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
      <view class="scroll-content">
        <text class="section-label">Drawer demo · Settings</text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          onPress={() => navigation().closeDrawer()}
          color={LINE_COLOR.structure}
        />
      </view>
    </scroll-view>
  );
}

// The navigator calls this once and untracked, so every `slot()` read sits in JSX
function renderDrawerContent(slot: Accessor<IDrawerContentSlotProps>) {
  return (
    <safe-area-view testID="drawer-panel" class="section-tight drawer-panel">
      <text class="section-label">Menu</text>
      <For each={slot().state.routes}>
        {route => (
          <pressable
            testID={`drawer-menu-${route.name}`}
            class="menu-row"
            onPress={() => slot().navigation.jumpTo(route.name)}
          >
            <text class="menu-row-label">
              {slot().descriptors[route.key]?.options.drawerLabel ??
                route.name}
            </text>
          </pressable>
        )}
      </For>
    </safe-area-view>
  );
}

// The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
export function DrawerDemoScreen() {
  const panel = createPanelState(DEFAULT_DRAWER_SETTINGS);
  return (
    <DrawerPanelContext.Provider value={panel}>
      <Drawer
        initialRouteName="Home"
        {...drawerPropsOf(panel.settings())}
        drawerStyle={DRAWER_STYLE}
        drawerContent={renderDrawerContent}
      >
        <Drawer.Screen
          name="Home"
          component={DrawerHomeScreen}
          options={homeOptions}
        />
        <Drawer.Screen
          name="Settings"
          component={DrawerSettingsScreen}
          options={settingsOptions}
        />
      </Drawer>
    </DrawerPanelContext.Provider>
  );
}
