<!-- Paints no background of its own, so the colour of the stack container shows through -->
<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';

  const navigation = useStackNavigation();
  const COLOR = LINE_COLOR.structure;
</script>

<view class="nested-inner">
  <text class="section-label">Inner stack</text>
  <ActionButton
    testID="nested-inner-push"
    title="Push detail"
    onPress={() => navigation.current.push('InnerDetail')}
    color={COLOR}
  />
</view>
