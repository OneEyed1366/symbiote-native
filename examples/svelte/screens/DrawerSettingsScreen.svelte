<script lang="ts">
  // Drawer demo · Settings: closeDrawer() driven from a screen OTHER than the one the swipe/open
  // buttons live on. This screen is mounted under a Drawer, so useDrawerNavigation() hands back
  // the Drawer-specific handle directly — no narrowing needed. Svelte twin of
  // examples/vue-sfc/screens/DrawerSettingsScreen.vue.
  import { useDrawerNavigation } from '@symbiote-native/navigation/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
  import ActionButton from '../components/ActionButton.svelte';

  const navigation = useDrawerNavigation();
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.DrawerDemo];
</script>

<safe-area-view class="screen">
  <view class="section">
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <text class="section-label">Drawer demo · Settings</text>
    <ActionButton
      testID="drawer-close-from-settings"
      title="Close drawer"
      onPress={() => navigation.current.closeDrawer()}
      color={LINE_COLOR.structure}
    />
  </view>
</safe-area-view>
