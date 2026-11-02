<script lang="ts">
  import { FlatList } from '@symbiote-native/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import { ACCENT, makeRows } from './canary-shared';

  const MVCP_ROW_COUNT = 20;
  const PREPEND_COUNT = 5;

  let items = $state(makeRows(0, MVCP_ROW_COUNT));
  let head = 0;

  function onPrepend(): void {
    head -= PREPEND_COUNT;
    items = [...makeRows(head, PREPEND_COUNT), ...items];
  }
</script>

<!-- PASS: scroll a bit, tap Prepend and the visible rows do not jump -->
<text class="section-label">MVCP · prepend without jump</text>
<FlatList
  testID="mvcp-list"
  nestedScrollEnabled
  data={items}
  keyExtractor={item => item.id}
  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
  class="box-list160"
>
  {#snippet item({ item })}
    <view class="mvcp-row">
      <text class="list-row-text">{item.label}</text>
    </view>
  {/snippet}
  <!-- The divider is list chrome between measured cells: the offset table has to count it -->
  {#snippet separator()}
    <view class="mvcp-divider" />
  {/snippet}
</FlatList>
<ActionButton title="Prepend 5" color={ACCENT} onPress={onPrepend} />
