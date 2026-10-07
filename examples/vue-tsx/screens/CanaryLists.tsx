import { defineComponent, ref } from 'vue';
import { FlatList } from '@symbiote-native/vue';
import type { IFlatListSlots, ISymbioteEvent } from '@symbiote-native/vue';
import { nativeNumber } from '../components/event-utils';
import { CHIP_GAP, CHIP_WIDTH, TRACK_ON, chips, makeRows } from './canary-shared';

type IChip = (typeof chips)[number];
type IRow = { id: string; label: string };

const MVCP_START = 20;
const PREPEND_COUNT = 5;
const KEEP_VISIBLE = { minIndexForVisible: 0 };
const HIT_SLOP = { top: 0, bottom: 40, left: 0, right: 0 };
const RETENTION = { top: 0, bottom: 80, left: 0, right: 0 };

// Size and gap come from script consts a CSS selector cannot read, the color is per chip
export const CanaryChips = defineComponent({
  name: 'CanaryChips',
  setup() {
    return () => (
      <>
        <text class="section-label">FlatList · 24 chips, windowed</text>
        <FlatList
          testID="chips-list"
          data={chips}
          horizontal={true}
          keyExtractor={(item: IChip) => item.id}
          getItemLayout={(_data: unknown, index: number) => ({
            length: CHIP_WIDTH + CHIP_GAP,
            offset: (CHIP_WIDTH + CHIP_GAP) * index,
            index,
          })}
          class="chip-list"
        >
          {
            {
              item: ({ item }) => (
                <view
                  class="chip-card"
                  style={{ width: CHIP_WIDTH, marginRight: CHIP_GAP, backgroundColor: item.color }}
                >
                  <text class="chip-number">{item.index}</text>
                </view>
              ),
            } satisfies IFlatListSlots<IChip>
          }
        </FlatList>
      </>
    );
  },
});

// PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it
export const CanaryRetentionCard = defineComponent({
  name: 'CanaryRetentionCard',
  setup() {
    const move = ref({ dx: 0, dy: 0 });
    const onMove = (event: ISymbioteEvent): void => {
      move.value = {
        dx: Math.round(nativeNumber(event, 'locationX')),
        dy: Math.round(nativeNumber(event, 'locationY')),
      };
    };
    return () => (
      <pressable
        hitSlop={HIT_SLOP}
        pressRetentionOffset={RETENTION}
        onPressMove={onMove}
        class="retention-card"
        style={({ pressed }) => ({ backgroundColor: pressed ? TRACK_ON : '#2c3e50' })}
      >
        <text class="info-text">{`drag me · dx ${move.value.dx} · dy ${move.value.dy}`}</text>
      </pressable>
    );
  },
});

// PASS: scroll a bit, tap Prepend and the visible rows do not jump
export const CanaryMvcpList = defineComponent({
  name: 'CanaryMvcpList',
  setup() {
    const items = ref(makeRows(0, MVCP_START));
    let head = 0;
    const prepend = (): void => {
      head -= PREPEND_COUNT;
      items.value = [...makeRows(head, PREPEND_COUNT), ...items.value];
    };
    return () => (
      <>
        <text class="section-label">MVCP · prepend without jump</text>
        <FlatList
          data={items.value}
          keyExtractor={(item: IRow) => item.id}
          maintainVisibleContentPosition={KEEP_VISIBLE}
          nestedScrollEnabled
          class="box-list160"
        >
          {
            {
              item: ({ item }) => (
                <view class="mvcp-row">
                  <text class="list-row-text">{item.label}</text>
                </view>
              ),
              // The divider is list chrome between measured cells: the offset table has to count it
              separator: () => <view class="mvcp-divider" />,
            } satisfies IFlatListSlots<IRow>
          }
        </FlatList>
        <button title="Prepend 5" color="#42b883" onPress={prepend} />
      </>
    );
  },
});
