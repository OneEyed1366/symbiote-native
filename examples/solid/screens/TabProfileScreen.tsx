// Tabs demo · Profile tab: no icon/badge/tint override, so the default tab look sits beside the
// customized Home/Search tabs.
//
// isFocused stays an accessor read inside the JSX — see TabHomeScreen for why a snapshot freezes.

import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import { createIsFocused } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.TabsDemo];

export function TabProfileScreen() {
  const isFocused = createIsFocused();

  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>
        <Text class="section-label">Profile tab</Text>
        <Text class="info-text">{`focused: ${isFocused()}`}</Text>
      </View>
    </SafeAreaView>
  );
}
