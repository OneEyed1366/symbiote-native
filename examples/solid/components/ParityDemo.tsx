// Verification panel for five feature-parity behaviours: Text.onLongPress synthesis,
// Keyboard.dismiss (blur the focused input), animated FlatList scroll, sticky SectionList headers,
// and AccessibilityInfo.sendAccessibilityEvent. Each leaves a dlog seam (DEBUG=1 -> logcat) and a
// visible effect, so a real host confirms what the headless smokes prove in JS.
//
// THE ONE SOLID-SHAPED DIFFERENCE, and it runs through every render prop below: `renderItem` /
// `renderSectionHeader` are handed an ACCESSOR, not the info object every other adapter passes.
// Solid has no reconciler under a render prop, so a snapshot would freeze the row at its
// mount-time item (.claude/rules/solid-descriptor-bridge.md §4). Two consequences to respect when
// editing these: read `info()` INSIDE the JSX, never into a top-level const of the callback (the
// callback is invoked once, untracked, so a top-level read is frozen), and keep the branch inline
// rather than lifting it into a helper — the compiler memoizes a condition written in JSX and not
// one moved into a function.
//
// Refs ride the public components here: `Text` forwards `ref` (ITextProps.ref) and the lists
// forward theirs to the imperative handle, so no hand-authored host tag is needed — Svelte's twin
// needs one only because its wrappers expose no bind:this.

import { createSignal } from 'solid-js';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  SectionList,
  Text,
  TextInput,
  View,
  type IFlatListHandle,
  type IHostInstance,
  type ISection,
} from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';
import './ParityDemo.css';

const PARITY_ROW_H = 30;

interface IParityRow {
  id: string;
  n: number;
}

interface ISectionRow {
  id: string;
  label: string;
}

const parityRows: IParityRow[] = Array.from(
  { length: 30 },
  (_unused, index) => ({ id: `pr-${index}`, n: index }),
);

// Tall sections (taller than the list viewport) so the sticky cross-talk is visible: as you
// scroll, the next section header should reach the top and PUSH the pinned one off.
function sectionData(prefix: string, label: string): ISectionRow[] {
  return Array.from({ length: 8 }, (_unused, index) => ({
    id: `${prefix}${index}`,
    label: `${label} ${index}`,
  }));
}

const paritySections: ISection<ISectionRow>[] = [
  { title: 'Fruit', data: sectionData('f', 'apple') },
  { title: 'Tools', data: sectionData('t', 'hammer') },
  { title: 'Cities', data: sectionData('c', 'porto') },
];

// The row's height comes from the script const above, which a CSS selector has no way to read —
// that one property stays an inline style alongside the static `parity-row` class. Hoisted so the
// object identity is stable across recomputes.
const PARITY_ROW_STYLE = { height: PARITY_ROW_H };

export function ParityDemo() {
  const [longPressMsg, setLongPressMsg] = createSignal(
    'long-press or tap the row below',
  );
  const [dismissMsg, setDismissMsg] = createSignal(
    'focus the field, then Hide keyboard',
  );

  // Plain `let`, not a signal: the compiler turns `ref={list}` on a component into a callback that
  // assigns the variable, and nothing here paints off it — it is only ever called into.
  let list: IFlatListHandle | undefined;
  let title: IHostInstance | undefined;

  // Node-based sendAccessibilityEvent routes through the Fabric slot on both platforms (enable
  // TalkBack/VoiceOver to feel the focus jump).
  const focusTitle = (): void => {
    if (title !== undefined) {
      AccessibilityInfo.sendAccessibilityEvent(title, 'focus');
    }
  };

  return (
    <View class="section-nested">
      <Text ref={title} class="section-label">
        Parity checks · longPress · dismiss · animated scroll · sticky · a11y
        focus
      </Text>

      {/* Text.onLongPress synthesis: hold ~0.5s (suppresses the tap) vs a quick tap */}
      <Text
        class="parity-long-press-row"
        onLongPress={() => setLongPressMsg('long press! (tap was suppressed)')}
        onPress={() => setLongPressMsg('tap')}
      >
        {longPressMsg()}
      </Text>

      {/* Keyboard.dismiss: blurs whatever input holds focus, no ref needed */}
      <TextInput
        placeholder="focus me…"
        placeholderTextColor="#41506a"
        class="parity-input"
        onFocus={() => setDismissMsg('keyboard up — tap Hide keyboard')}
        onBlur={() => setDismissMsg('blurred (keyboard down)')}
      />
      <Text class="parity-note">{dismissMsg()}</Text>
      <ActionButton
        title="Hide keyboard"
        onPress={() => Keyboard.dismiss()}
        color="#7aa2e3"
      />

      {/* animated list scroll: smooth (native command) vs instant. A fixed height with no
          wrapper — the vertical ScrollView clips to its own frame, so rows stay inside the box
          on iOS too. */}
      <Text class="section-label">FlatList · animated scrollToOffset</Text>
      <FlatList
        ref={list}
        class="parity-list"
        data={parityRows}
        keyExtractor={item => item.id}
        getItemLayout={(_data, index) => ({
          length: PARITY_ROW_H,
          offset: PARITY_ROW_H * index,
          index,
        })}
        renderItem={info => (
          <View class="parity-row" style={PARITY_ROW_STYLE}>
            <Text class="parity-text">{`row ${info().item.n}`}</Text>
          </View>
        )}
      />
      <View class="row">
        <View class="flex1">
          <ActionButton
            title="Scroll ▼ animated"
            onPress={() =>
              list?.scrollToOffset({
                offset: 20 * PARITY_ROW_H,
                animated: true,
              })
            }
            color="#7aa2e3"
          />
        </View>
        <View class="flex1">
          <ActionButton
            title="Top · instant"
            onPress={() => list?.scrollToOffset({ offset: 0, animated: false })}
            color="#7aa2e3"
          />
        </View>
      </View>

      {/* sticky section headers. Drag the inner list: each header pins at the top, and as the
          NEXT header reaches the top it should PUSH the pinned one off. */}
      <Text class="section-label">
        SectionList · sticky (scroll: next header should push prev off)
      </Text>
      <SectionList
        testID="sticky-section-list"
        class="parity-section-list"
        sections={paritySections}
        keyExtractor={item => item.id}
        stickySectionHeadersEnabled
        renderSectionHeader={info => (
          <Text class="parity-section-header">{info().section.title}</Text>
        )}
        renderItem={info => (
          <View class="parity-row" style={PARITY_ROW_STYLE}>
            <Text class="parity-text">{info().item.label}</Text>
          </View>
        )}
      />

      <ActionButton
        title="Focus the panel title (a11y)"
        onPress={focusTitle}
        color="#7aa2e3"
      />
    </View>
  );
}
