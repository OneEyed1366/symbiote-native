<script lang="ts">
  import { useStackNavigation } from '@symbiote-native/navigation/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { LINE_COLOR } from '../../navigation-lines';

  const navigation = useStackNavigation();
  const COLOR = LINE_COLOR.structure;
</script>

<view class="nested-inner">
  <text class="section-label">Inner detail</text>
  <ActionButton
    testID="nested-inner-pop"
    title="Pop"
    onPress={() => navigation.current.pop()}
    color={COLOR}
  />
</view>
