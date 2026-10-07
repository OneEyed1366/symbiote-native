import { defineComponent, ref, shallowRef } from 'vue';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  SectionList,
  dlog,
} from '@symbiote-native/vue';
import type {
  IFlatListHandle,
  IFlatListSlots,
  IHostInstance,
  ISection,
  ISectionListSlots,
} from '@symbiote-native/vue';

type IParityRow = { id: string; n: number };
type ISectionRow = { id: string; label: string };

const ROW_HEIGHT = 30;
const SCROLL_TARGET_ROWS = 20;
const SECTION_ROWS = 8;
const ACCENT = '#42b883';
const HINT_COLOR = '#3b5266';
const ROWS: IParityRow[] = Array.from({ length: 30 }, (_unused, index) => ({ id: `pr-${index}`, n: index }));

// Taller than the list viewport, so the next header visibly pushes the pinned one off
const sectionRows = (prefix: string, label: string): ISectionRow[] =>
  Array.from({ length: SECTION_ROWS }, (_unused, index) => ({
    id: `${prefix}${index}`,
    label: `${label} ${index}`,
  }));
const SECTIONS: ISection<ISectionRow>[] = [
  { title: 'Fruit', data: sectionRows('f', 'apple') },
  { title: 'Tools', data: sectionRows('t', 'hammer') },
  { title: 'Cities', data: sectionRows('c', 'porto') },
];

// Text.onLongPress synthesis: hold ~0.5s to suppress the tap
const LongPressRow = defineComponent({
  name: 'LongPressRow',
  setup() {
    const message = ref('long-press or tap the row below');
    return () => (
      <text
        onLongPress={() => {
          message.value = 'long press! (tap was suppressed)';
        }}
        onPress={() => {
          message.value = 'tap';
        }}
        class="long-press-row"
      >
        {message.value}
      </text>
    );
  },
});

// Keyboard.dismiss blurs whatever input holds focus, with no ref needed
const DismissKeyboardRow = defineComponent({
  name: 'DismissKeyboardRow',
  setup() {
    const message = ref('focus the field, then Hide keyboard');
    return () => (
      <>
        <text-input
          placeholder="focus me…"
          placeholderTextColor={HINT_COLOR}
          onFocus={() => {
            message.value = 'keyboard up — tap Hide keyboard';
          }}
          onBlur={() => {
            message.value = 'blurred (keyboard down)';
          }}
          class="focus-input"
        />
        <text class="note-text">{message.value}</text>
        <button title="Hide keyboard" onPress={() => Keyboard.dismiss()} color={ACCENT} />
      </>
    );
  },
});

// Smooth scrolling is a native command, the instant one a plain offset. The vertical ScrollView
// clips to its own frame, so a fixed height with no wrapper keeps the rows inside the box
const AnimatedScrollList = defineComponent({
  name: 'AnimatedScrollList',
  setup() {
    const listRef = shallowRef<IFlatListHandle | null>(null);
    return () => (
      <>
        <text class="section-label">FlatList · animated scrollToOffset</text>
        <FlatList
          ref={listRef}
          nestedScrollEnabled
          data={ROWS}
          keyExtractor={item => item.id}
          getItemLayout={(_data: unknown, index: number) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
          class="parity-list"
          // The same item type flows into the emit payload, so `item.n` is typed
          onViewableItemsChanged={info => {
            dlog(`Vue FlatList viewable ${info.viewableItems.map(token => token.item.n).join(',')}`);
          }}
        >
          {
            {
              item: ({ item }) => (
                <view class="parity-row" style={{ height: ROW_HEIGHT }}>
                  <text class="info-text">{`row ${item.n}`}</text>
                </view>
              ),
            } satisfies IFlatListSlots<IParityRow>
          }
        </FlatList>
        <view class="row">
          <view class="flex1">
            <button
              title="Scroll ▼ animated"
              onPress={() => listRef.value?.scrollToOffset({ offset: SCROLL_TARGET_ROWS * ROW_HEIGHT, animated: true })}
              color={ACCENT}
            />
          </view>
          <view class="flex1">
            <button
              title="Top · instant"
              onPress={() => listRef.value?.scrollToOffset({ offset: 0, animated: false })}
              color={ACCENT}
            />
          </view>
        </view>
      </>
    );
  },
});

// Drag the inner list: each header pins at the top and the next one should push it off
const StickySections = defineComponent({
  name: 'StickySections',
  setup() {
    return () => (
      <>
        <text class="section-label">SectionList · sticky (scroll: next header should push prev off)</text>
        <SectionList
          testID="sticky-section-list"
          nestedScrollEnabled
          sections={SECTIONS}
          keyExtractor={(item: ISectionRow) => item.id}
          stickySectionHeadersEnabled={true}
          class="section-list"
        >
          {
            {
              sectionHeader: ({ section }) => <text class="section-header">{section.title}</text>,
              item: ({ item }) => (
                <view class="parity-row" style={{ height: ROW_HEIGHT }}>
                  <text class="info-text">{item.label}</text>
                </view>
              ),
            } satisfies ISectionListSlots<ISectionRow>
          }
        </SectionList>
      </>
    );
  },
});

// Five feature-parity behaviors with no other canary surface, each leaves a dlog seam under DEBUG=1
export const ParityDemo = defineComponent({
  name: 'ParityDemo',
  setup() {
    const titleRef = shallowRef<IHostInstance | null>(null);
    const focusTitle = (): void => {
      if (titleRef.value !== null) {
        AccessibilityInfo.sendAccessibilityEvent(titleRef.value, 'focus');
      }
    };
    return () => (
      <view class="section-nested">
        <text ref={titleRef} class="section-label">
          Parity checks · longPress · dismiss · animated scroll · sticky · a11y focus
        </text>
        <LongPressRow />
        <DismissKeyboardRow />
        <AnimatedScrollList />
        <StickySections />
        {/* sendAccessibilityEvent routes through the Fabric slot on both platforms */}
        <button title="Focus the panel title (a11y)" onPress={focusTitle} color={ACCENT} />
      </view>
    );
  },
});
