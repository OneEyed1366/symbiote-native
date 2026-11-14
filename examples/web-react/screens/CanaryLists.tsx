import { useRef, useState } from 'react';
import { FlatList } from '@symbiote-native/react';
import { ActionButton } from '../components/ActionButton';
import { nativeNumber } from '../components/event-utils';
import { LINE_COLOR } from '../navigation-lines';
import { MvcpDivider } from './canary-parts';
import { CHIP_GAP, CHIP_WIDTH, chips } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
const MVCP_START = 20;
const PREPEND_COUNT = 5;

const rowAt = (position: number) => ({ id: `row-${position}`, label: `item ${position}` });

// Size and gap come from script consts a CSS selector cannot read, the color is per chip
export function CanaryChips() {
  return (
    <>
      <text className="section-label">FlatList · 24 chips, windowed</text>
      <FlatList
        testID="chips-list"
        data={chips}
        horizontal
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({
          length: CHIP_WIDTH + CHIP_GAP,
          offset: (CHIP_WIDTH + CHIP_GAP) * index,
          index,
        })}
        className="chip-list"
        renderItem={({ item }) => (
          <view
            className="chip-card"
            style={{ width: CHIP_WIDTH, marginRight: CHIP_GAP, backgroundColor: item.color }}
          >
            <text className="chip-number">{item.index}</text>
          </view>
        )}
      />
    </>
  );
}

// PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it
export function CanaryRetentionCard() {
  const [move, setMove] = useState({ dx: 0, dy: 0 });
  return (
    <pressable
      hitSlop={{ top: 0, bottom: 40, left: 0, right: 0 }}
      pressRetentionOffset={{ top: 0, bottom: 80, left: 0, right: 0 }}
      onPressMove={event =>
        setMove({
          dx: Math.round(nativeNumber(event, 'locationX')),
          dy: Math.round(nativeNumber(event, 'locationY')),
        })
      }
      className="retention-card"
      style={({ pressed }) => ({ backgroundColor: pressed ? COLOR : '#13243a' })}
    >
      <text className="info-text">{`drag me · dx ${move.dx} · dy ${move.dy}`}</text>
    </pressable>
  );
}

// PASS: scroll a bit, tap Prepend and the visible rows do not jump
export function CanaryMvcpList() {
  const [items, setItems] = useState(() => Array.from({ length: MVCP_START }, (_value, index) => rowAt(index)));
  const head = useRef(0);
  const prepend = () => {
    head.current -= PREPEND_COUNT;
    const added = Array.from({ length: PREPEND_COUNT }, (_value, index) => rowAt(head.current + index));
    setItems(previous => [...added, ...previous]);
  };
  return (
    <>
      <text className="section-label">MVCP · prepend without jump</text>
      <FlatList
        nestedScrollEnabled
        data={items}
        keyExtractor={item => item.id}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        className="box-list160"
        // The divider is list chrome between measured cells: the offset table has to count it
        ItemSeparatorComponent={MvcpDivider}
        renderItem={({ item }) => (
          <view className="mvcp-row">
            <text className="list-row-text">{item.label}</text>
          </view>
        )}
      />
      <ActionButton title="Prepend 5" color={COLOR} onPress={prepend} />
    </>
  );
}
