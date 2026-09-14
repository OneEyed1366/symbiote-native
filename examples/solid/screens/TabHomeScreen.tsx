// Tabs demo · Home tab: the custom tabBarIcon + tabBarActiveTintColor registered on
// TabsDemoScreen's <Tab.Screen>.
//
// createIsFocused, not useIsFocused: it OWNS a signal and two emitter subscriptions, and Solid
// reserves use* for consuming what already exists. It hands back an ACCESSOR, read inside the JSX
// below — this body runs once, so a body-level `const focused = isFocused()` would paint `false`
// forever and never react to the tab switch this screen exists to show.

import { createIsFocused } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// A module constant keyed by a literal — nothing to keep reactive.
const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

export function TabHomeScreen() {
  const isFocused = createIsFocused();

  return (
    <safe-area-view class="screen">
      <view class="demo-section">
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </text>
        </view>
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
        <text class="info-text">{`focused: ${isFocused()}`}</text>
      </view>
    </safe-area-view>
  );
}
