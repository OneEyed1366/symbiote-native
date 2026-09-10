import { defineComponent } from 'vue';
import { Tab, useIsFocused } from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

const tabsLineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

const TabLineTag = defineComponent(
  () => () => (
    <view class={`line-tag line-tag-${tabsLineInfo.line}`}>
      <text class="line-tag-text">{`${tabsLineInfo.code} · ${tabsLineInfo.label}`}</text>
    </view>
  ),
  { name: 'TabLineTag' },
);

const TabHomeScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <TabLineTag />
          <view class="hero-card">
            <view
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.structure }}
            >
              <text class="hero-badge-text">TB</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Tabs</text>
              <text class="hero-body">
                A bottom-tabs navigator — icon, badge, and tint, each tab a real
                native view.
              </text>
            </view>
          </view>
          <text class="info-text">{`focused: ${isFocused.value}`}</text>
        </view>
      </safe-area-view>
    );
  },
  { name: 'TabHomeScreen' },
);

const TabSearchScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <TabLineTag />
          <text class="section-label">Search tab</text>
          <text class="info-text">{`focused: ${isFocused.value}`}</text>
        </view>
      </safe-area-view>
    );
  },
  { name: 'TabSearchScreen' },
);

const TabProfileScreen = defineComponent(
  () => {
    const isFocused = useIsFocused();
    return () => (
      <safe-area-view class="screen">
        <view class="section">
          <TabLineTag />
          <text class="section-label">Profile tab</text>
          <text class="info-text">{`focused: ${isFocused.value}`}</text>
        </view>
      </safe-area-view>
    );
  },
  { name: 'TabProfileScreen' },
);

/**
 * Tabs demo: a bottom-tabs Tab navigator with 3 Tab.Screens. Home gets a custom tabBarIcon +
 * tabBarActiveTintColor; Search gets a tabBarBadge; Profile stays plain to show the default
 * tint/no-icon look side by side with the customized tabs.
 */
export const TabsDemoScreen = defineComponent(
  () => () => (
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
  ),
  { name: 'TabsDemoScreen' },
);
