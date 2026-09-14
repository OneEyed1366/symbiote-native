// Drawer demo · Settings: closeDrawer() driven from a screen OTHER than the one carrying the
// open/toggle buttons, which is the whole point of this second route.
//
// Same accessor discipline as DrawerHomeScreen — navigation() at the use site, never destructured.

import { useDrawerNavigation } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { ActionButton } from '../components/ActionButton';
import './DrawerDemoScreen.css';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];

export function DrawerSettingsScreen() {
  const navigation = useDrawerNavigation();

  return (
    <safe-area-view class="screen">
      <view class="demo-section">
        <view class={`line-tag line-tag-${lineInfo.line}`}>
          <text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </text>
        </view>
        <text class="section-label">Drawer demo · Settings</text>
        <ActionButton
          testID="drawer-close-from-settings"
          title="Close drawer"
          onPress={() => navigation().closeDrawer()}
          color={LINE_COLOR.structure}
        />
      </view>
    </safe-area-view>
  );
}
