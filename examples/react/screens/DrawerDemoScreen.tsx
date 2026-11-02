import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/react';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
  IScreenOptions,
} from '@symbiote-native/navigation/react';
import type { IDrawerRouterState } from '@symbiote-native/navigation';
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
function DrawerHomeScreen() {
  return (
    <scroll-view className="screen" contentInsetAdjustmentBehavior="automatic">
      <view className="scroll-content">
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
    <scroll-view className="screen" contentInsetAdjustmentBehavior="automatic">
      <view className="scroll-content">
        <text className="section-label">Drawer demo · Settings</text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          onPress={() => navigation.closeDrawer()}
          color={LINE_COLOR.structure}
        />
      </view>
    </scroll-view>
  );
}

type IDrawerContentProps = {
  state: IDrawerRouterState;
  descriptors: IDrawerDescriptorMap;
  navigation: IDrawerNavigatorHandle;
};

function renderDrawerContent({
  state,
  descriptors,
  navigation,
}: IDrawerContentProps) {
  return (
    <safe-area-view
      testID="drawer-panel"
      className="section-tight drawer-panel"
    >
      <text className="section-label">Menu</text>
      {state.routes.map(route => (
        <pressable
          key={route.key}
          testID={`drawer-menu-${route.name}`}
          className="menu-row"
          onPress={() => navigation.jumpTo(route.name)}
        >
          <text className="menu-row-label">
            {descriptors[route.key]?.options.drawerLabel ?? route.name}
          </text>
        </pressable>
      ))}
    </safe-area-view>
  );
}

// The panel lives here, above the Drawer, so its two screens share it and it outlives a switch
export function DrawerDemoScreen() {
  const panel = usePanelState(DEFAULT_DRAWER_SETTINGS);
  return (
    <DrawerPanelContext.Provider value={panel}>
      <Drawer
        initialRouteName="Home"
        {...drawerPropsOf(panel.settings)}
        renderDrawerContent={renderDrawerContent}
        drawerStyle={DRAWER_STYLE}
      >
        <Drawer.Screen
          name="Home"
          component={DrawerHomeScreen}
          options={{ title: 'Home', drawerLabel: 'Home' }}
        />
        <Drawer.Screen
          name="Settings"
          component={DrawerSettingsScreen}
          options={{ title: 'Settings', drawerLabel: 'Settings' }}
        />
      </Drawer>
    </DrawerPanelContext.Provider>
  );
}
