import { For, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { FlatList } from '@symbiote-native/solid';
import { ActionButton } from '../components/ActionButton';
import { nativeNumber } from '../components/event-utils';
import { LINE_COLOR } from '../navigation-lines';
import { MvcpDivider } from './canary-parts';
import { CHIPS, CHIP_GAP, CHIP_WIDTH, makeRows } from './canary-shared';
import type { IChip, IMvcpRow } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
const MVCP_START = 20;
const PREPEND_COUNT = 5;
const PROBE_FILLS = ['#5599ff', 'hsl(280 70% 55%)'];
const PROBE_ROW_STYLE = { flexDirection: 'row', height: 56 } as const;
const PROBE_HEX_STYLE = { width: 48, height: 48, marginRight: 8, backgroundColor: '#ff5555' };
const PROBE_HSL_STYLE = { width: 48, height: 48, marginRight: 8, backgroundColor: 'hsl(120 70% 55%)' };
const PROBE_GAP_STYLE = { marginRight: 8 };

// Size and gap come from script consts a CSS selector cannot read, the color is per chip
export function CanaryChips() {
  return (
    <>
      <text class="section-label">FlatList · 24 chips, windowed</text>
      <FlatList<IChip>
        testID="chips-list"
        data={CHIPS}
        horizontal
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({
          length: CHIP_WIDTH + CHIP_GAP,
          offset: (CHIP_WIDTH + CHIP_GAP) * index,
          index,
        })}
        class="chip-list"
        renderItem={info => (
          <view
            class="chip-card"
            style={{ width: CHIP_WIDTH, marginRight: CHIP_GAP, backgroundColor: info().item.color }}
          >
            <text class="chip-number">{info().item.index}</text>
          </view>
        )}
      />
    </>
  );
}

// Five fills from five sources in one row. A hole means the color grammar quietly narrowed again
export function CanaryFillProbe() {
  return (
    <>
      <text class="section-label">probe A · fill sources</text>
      <view style={PROBE_ROW_STYLE}>
        {/* 1 inline hex */}
        <view style={PROBE_HEX_STYLE} />
        {/* 2 inline hsl, the spelling the chips use */}
        <view style={PROBE_HSL_STYLE} />
        {/* 3 fill from a class, no inline style */}
        <view class="probe-fill" style={PROBE_GAP_STYLE} />
        {/* 4 and 5 the same two fills, produced inside a For */}
        <For each={PROBE_FILLS}>
          {fill => <view style={{ width: 48, height: 48, marginRight: 8, backgroundColor: fill }} />}
        </For>
      </view>
    </>
  );
}

// PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it.
// A store, not a signal holding an object: both fields land in one native event
export function CanaryRetentionCard() {
  const [move, setMove] = createStore({ dx: 0, dy: 0 });
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
      class="retention-card"
      style={state => ({ backgroundColor: state.pressed ? COLOR : '#151c33' })}
    >
      {() => <text class="info-text">{`drag me · dx ${move.dx} · dy ${move.dy}`}</text>}
    </pressable>
  );
}

// PASS: scroll a bit, tap Prepend and the visible rows do not jump
export function CanaryMvcpList() {
  const [items, setItems] = createSignal<ReadonlyArray<IMvcpRow>>(makeRows(0, MVCP_START));
  // Plain `let`: a Solid component body runs once, so a closure variable is stable already
  let head = 0;
  const prepend = (): void => {
    head -= PREPEND_COUNT;
    const added = makeRows(head, PREPEND_COUNT);
    setItems(previous => [...added, ...previous]);
  };
  return (
    <>
      <text class="section-label">MVCP · prepend without jump</text>
      <FlatList<IMvcpRow>
        nestedScrollEnabled
        data={items()}
        keyExtractor={item => item.id}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        class="box-list160"
        // The divider is list chrome between measured cells: the offset table has to count it
        ItemSeparatorComponent={MvcpDivider}
        renderItem={info => (
          <view class="mvcp-row">
            <text class="list-row-text">{info().item.label}</text>
          </view>
        )}
      />
      <ActionButton title="Prepend 5" color={COLOR} onPress={prepend} />
    </>
  );
}
