// Tabs demo · Profile tab: no icon/badge/tint override, so the default tab look sits beside the
// customized Home/Search tabs.
//
// isFocused stays an accessor read inside the JSX — see TabHomeScreen for why a snapshot freezes.

import { createIsFocused } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

export function TabProfileScreen() {
  const isFocused = createIsFocused();

  return (
    <safe-area-view class="screen">
      <view class="demo-section">
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </text>
        </view>
        <text class="section-label">Profile tab</text>
        <text class="info-text">{`focused: ${isFocused()}`}</text>
      </view>
    </safe-area-view>
  );
}
