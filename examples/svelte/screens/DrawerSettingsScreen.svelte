<script lang="ts">
  import { useDrawerNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { LINE_COLOR } from '../navigation-lines';

  const navigation = useDrawerNavigation();
  const COLOR = LINE_COLOR.structure;
</script>

<scroll-view class="screen" contentInsetAdjustmentBehavior="automatic">
  <view class="scroll-content">
    <text class="section-label">Drawer demo · Settings</text>
    <ActionButton
      testID="drawer-close-from-settings"
      title="Close drawer"
      onPress={() => navigation.current.closeDrawer()}
      color={COLOR}
    />
  </view>
</scroll-view>
