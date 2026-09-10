// Wave 4, part 2: SectionList over VirtualizedSectionList. The thing only a real host settles is
// STICKY HEADERS — a header must detach from its section and pin to the top as the next section
// scrolls up, then hand the pin over. Nothing headless observes that; it is native scroll driving
// a translateY on a view the list flagged.
//
// Also here: the two separator kinds, which are easy to confuse and are genuinely different.
//   ItemSeparatorComponent     the gap BETWEEN two rows of the same section
//   SectionSeparatorComponent  the gap between one section's end and the next section's start
// The second is a COMPONENT, not an element — it is instantiated once per gap, whereas a JSX
// element prop is a getter that builds ONE node and would hand the same node to every position.

import { createSignal } from 'solid-js';
import { ListDiagnostics } from './ListDiagnostics';
import {
  Pressable,
  SectionList,
  type ISectionListHandle,
} from '@symbiote-native/solid';

interface IContact {
  key: string;
  name: string;
  detail: string;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const NAMES: Record<string, readonly string[]> = {
  A: ['Ada', 'Alan', 'Anita', 'Arto'],
  B: ['Barbara', 'Bjarne', 'Brian'],
  C: ['Carol', 'Cynthia'],
  D: ['Dennis', 'Donald', 'Dorothy', 'Douglas', 'Duke'],
  E: ['Edsger', 'Erik'],
  F: ['Frances', 'Fred', 'Fran'],
};

const SECTIONS = LETTERS.map(letter => ({
  key: letter,
  title: letter,
  data: (NAMES[letter] ?? []).map((name, index) => ({
    key: `${letter}-${index}`,
    name,
    detail: `${name.length} letters`,
  })),
}));

// Hoisted out of the component body on purpose. Solid does not re-render, so nothing here would
// actually churn — but keeping them at module scope states that intent, and silences the React
// lint rule about component identity that the shared eslint config still applies to .tsx files.
const Divider = () => <view class="divider" />;
const SectionGap = () => <view class="section-gap" />;

export function SectionsScreen() {
  const [sticky, setSticky] = createSignal(true);
  let list: ISectionListHandle | undefined;

  return (
    <view class="screen-body">
      <view class="toolbar">
        <Pressable class="chip" onPress={() => setSticky(current => !current)}>
          {() => (
            <text class="chip-label">sticky: {sticky() ? 'on' : 'off'}</text>
          )}
        </Pressable>
        {/* itemIndex 0 targets the section HEADER, not the first row — RN's own convention. */}
        <Pressable
          class="chip"
          onPress={() =>
            list?.scrollToLocation({
              sectionIndex: 3,
              itemIndex: 0,
              animated: true,
            })
          }
        >
          {() => <text class="chip-label">Jump to D</text>}
        </Pressable>
      </view>

      <ListDiagnostics />

      <SectionList<IContact>
        class="scroll"
        contentContainerStyle="content"
        ref={handle => {
          list = handle;
        }}
        sections={SECTIONS}
        stickySectionHeadersEnabled={sticky()}
        keyExtractor={contact => contact.key}
        initialNumToRender={8}
        windowSize={3}
        renderSectionHeader={info => (
          <view class="section-header">
            <text class="section-header-label">{info().section.title}</text>
          </view>
        )}
        renderSectionFooter={info => (
          <text class="section-footer">
            {info().section.data.length} in {info().section.title}
          </text>
        )}
        ItemSeparatorComponent={Divider}
        SectionSeparatorComponent={SectionGap}
        renderItem={info => (
          <view class="contact">
            <text class="row-label">{info().item.name}</text>
            <text class="subtle">{info().item.detail}</text>
          </view>
        )}
        ListHeaderComponent={
          <view class="card">
            <text class="section">SectionList · sticky headers</text>
            <text class="subtitle">
              Scroll and watch a header pin to the top, then hand the pin to the
              next one. Toggle sticky off to see the difference.
            </text>
          </view>
        }
      />
    </view>
  );
}
