import { Tab, useIsFocused } from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const tabsLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

function TabLineTag() {
  return (
    <view className={`line-tag line-tag-${tabsLineInfo.line}`}>
      <text className="line-tag-text">{`${tabsLineInfo.code} · ${tabsLineInfo.label}`}</text>
    </view>
  );
}

function TabHomeScreen() {
  const isFocused = useIsFocused();
  return (
    <safe-area-view className="screen">
      <view className="section">
        <TabLineTag />
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.structure }}
          >
            <text className="hero-badge-text">TB</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Tabs</text>
            <text className="hero-body">
              A bottom-tabs navigator — icon, badge, and tint, each tab a real
              native view.
            </text>
          </view>
        </view>
        <text className="info-text">{`focused: ${isFocused}`}</text>
      </view>
    </safe-area-view>
  );
}

function TabSearchScreen() {
  const isFocused = useIsFocused();
  return (
    <safe-area-view className="screen">
      <view className="section">
        <TabLineTag />
        <text className="section-label">Search tab</text>
        <text className="info-text">{`focused: ${isFocused}`}</text>
      </view>
    </safe-area-view>
  );
}

function TabProfileScreen() {
  const isFocused = useIsFocused();
  return (
    <safe-area-view className="screen">
      <view className="section">
        <TabLineTag />
        <text className="section-label">Profile tab</text>
        <text className="info-text">{`focused: ${isFocused}`}</text>
      </view>
    </safe-area-view>
  );
}

/**
 * Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
 * tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
 * tint/no-icon look side by side with the customized tabs.
 */
export function TabsDemoScreen() {
  return (
    <Tab initialRouteName="Home">
      <Tab.Screen
        name="Home"
        component={TabHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: '🏠',
          tabBarActiveTintColor: LINE_COLOR.structure,
        }}
      />
      <Tab.Screen
        name="Search"
        component={TabSearchScreen}
        options={{ tabBarLabel: 'Search', tabBarIcon: '🔍', tabBarBadge: 3 }}
      />
      <Tab.Screen
        name="Profile"
        component={TabProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: '👤' }}
      />
    </Tab>
  );
}
