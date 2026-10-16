<script lang="ts">
  import Reanimated, {
    FadeIn,
    LinearTransition,
  } from '@symbiote-native/reanimated/svelte';
  import ActionButton from '../../components/ActionButton.svelte';
  import { GO_COLOR } from './colors';
  import RaSection from './RaSection.svelte';

  const FIRST_ROWS = 3;
  const DIMMED = 0.6;

  type IRow = { id: string };

  const keyOf = (row: IRow) => row.id;

  // Every other row is dimmed by the cell style, which gets the item and its index
  const tintOfRow = ({ index }: { item: unknown; index: number }) => ({
    opacity: index % 2 === 0 ? 1 : DIMMED,
  });

  // The rows that are there when the list mounts skip their entering animation, a row added later
  // plays it
  let rows = $state<IRow[]>(
    Array.from({ length: FIRST_ROWS }, (_, index) => ({ id: String(index) })),
  );

  const addRow = () => {
    rows = [...rows, { id: String(rows.length) }];
  };
</script>

<RaSection
  title="Animated.FlatList"
  note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
>
  <Reanimated.FlatList
    testID="ra-flat-list"
    class="ra-list"
    data={rows}
    keyExtractor={keyOf}
    itemLayoutAnimation={LinearTransition}
    cellRendererComponentStyle={tintOfRow}
    skipEnteringExitingAnimations
  >
    {#snippet item({ item })}
      <view class="ra-item" p={{ entering: FadeIn }}>
        <text class="ra-item-text">{`item ${item.id}`}</text>
      </view>
    {/snippet}
  </Reanimated.FlatList>
  <ActionButton
    testID="ra-list-add"
    title="add row"
    onPress={addRow}
    color={GO_COLOR}
  />
</RaSection>
