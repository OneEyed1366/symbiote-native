// A second nested tab, proving the nested Tab bar switches focus normally. Solid twin of
// examples/svelte/screens/NestedTabInfoScreen.svelte.

import { SafeAreaView, Text, View } from '@symbiote-native/solid';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';

const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.NestedNavigators];

export function NestedTabInfoScreen() {
  return (
    <SafeAreaView class="screen">
      <View class="demo-section">
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">
            {`${lineInfo.code} · ${lineInfo.label}`}
          </Text>
        </View>
        <Text class="section-label">Nested Tab · Info</Text>
        <Text class="info-text">
          A second tab, proving the nested Tab bar switches focus normally.
        </Text>
      </View>
    </SafeAreaView>
  );
}
