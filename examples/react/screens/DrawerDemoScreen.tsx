import { Drawer, useDrawerNavigation } from '@symbiote-native/navigation/react';
import type {
  IDrawerDescriptorMap,
  IDrawerNavigatorHandle,
} from '@symbiote-native/navigation/react';
import type { IDrawerRouterState } from '@symbiote-native/navigation';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';

const drawerLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

// Home/Settings are each Drawer's own top-level screen component; useDrawerNavigation() reads the
// enclosing Drawer's handle (already narrowed to IDrawerNavigatorHandle) straight from context.
function DrawerHomeScreen() {
  const navigation = useDrawerNavigation();
  return (
    <safe-area-view className="screen">
      <view className="section">
        <view className={`line-tag line-tag-${drawerLineInfo.line}`}>
          <text className="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.structure }}
          >
            <text className="hero-badge-text">DR</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Drawer</text>
            <text className="hero-body">
              A swipeable drawer sliding in from the right, driven by the
              navigator's own gesture handler.
            </text>
          </view>
        </view>
        <text className="info-text">
          drawerPosition: right · drawerType: slide — swipe from the RIGHT edge,
          or use a button
        </text>
        <ActionButton
          testID="drawer-open"
          title="Open drawer"
          onPress={() => navigation.openDrawer()}
          color={LINE_COLOR.structure}
        />
        <ActionButton
          testID="drawer-toggle"
          title="Toggle drawer"
          onPress={() => navigation.toggleDrawer()}
          color={LINE_COLOR.structure}
        />
      </view>
    </safe-area-view>
  );
}

function DrawerSettingsScreen() {
  const navigation = useDrawerNavigation();
  return (
    <safe-area-view className="screen">
      <view className="section">
        <view className={`line-tag line-tag-${drawerLineInfo.line}`}>
          <text className="line-tag-text">{`${drawerLineInfo.code} · ${drawerLineInfo.label}`}</text>
        </view>
        <text className="section-label">Drawer demo · Settings</text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          onPress={() => navigation.closeDrawer()}
          color={LINE_COLOR.structure}
        />
      </view>
    </safe-area-view>
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
    <safe-area-view testID="drawer-panel" className="section-tight drawer-panel">
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

/**
 * Drawer demo: a swipeable Drawer navigator with 2 Drawer.Screens, a non-default
 * drawerPosition ('right') and drawerType ('slide') to prove those props actually flow through
 * to render-drawer.ts's geometry, plus imperative open/toggle/close buttons alongside the swipe
 * gesture. renderDrawerContent supplies the menu panel (Drawer ships no built-in one).
 */
export function DrawerDemoScreen() {
  return (
    <Drawer
      initialRouteName="Home"
      drawerPosition="right"
      drawerType="slide"
      renderDrawerContent={renderDrawerContent}
      drawerStyle={{ backgroundColor: '#13243a' }}
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
  );
}
