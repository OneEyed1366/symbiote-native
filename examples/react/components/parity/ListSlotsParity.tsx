import { useRef, useState } from 'react';
import { FlatList, SectionList } from '@symbiote-native/react';
import type { ICellRendererProps, ISection } from '@symbiote-native/react';
import { INPUT_HINT } from '../../screens/canary-shared';
import { ActionButton } from '../ActionButton';
import { PARITY_COLOR, ParityCard } from './ParityCard';
import { ROWS, rowIdOf, renderPlainRow } from './list-rows';
import type { IRow } from './list-rows';

const MANY_COUNT = 300;
const FEW_ROWS = ROWS.slice(0, 3);
const MANY_ROWS: IRow[] = Array.from({ length: MANY_COUNT }, (_unused, index) => ({
  id: `many-${index}`,
  label: `Row ${index}`,
}));
const SECTIONS: ISection<IRow>[] = [
  { title: 'Fruit', data: ROWS.slice(0, 2) },
  { title: 'Tools', data: ROWS.slice(2, 4) },
];

const Header = () => <text className="parity-slot">HEADER, upright</text>;
const Footer = () => <text className="parity-slot">FOOTER, upright</text>;
const Empty = () => <text className="parity-slot">EMPTY, upright</text>;

// On an inverted list the scroll is flipped, so each slot carries the counter-flip itself
function InvertedSlots() {
  const [isEmpty, setIsEmpty] = useState(false);
  return (
    <ParityCard
      title="Inverted list slots"
      rn="header, footer and empty slots read upright on an inverted list"
      look="all three labels read normally, not mirrored. Toggle shows the empty slot"
    >
      <ActionButton
        title={isEmpty ? 'Show rows' : 'Show empty'}
        color={PARITY_COLOR}
        onPress={() => setIsEmpty(value => !value)}
      />
      <FlatList
        inverted
        data={isEmpty ? [] : FEW_ROWS}
        keyExtractor={rowIdOf}
        renderItem={renderPlainRow}
        ListHeaderComponent={Header}
        ListFooterComponent={Footer}
        ListEmptyComponent={Empty}
        className="parity-list"
      />
    </ParityCard>
  );
}

// The component replaces the view around a cell, so it wires `onLayout` and `onFocus` itself
function FramedCell({ children, style, onLayout, onFocus }: ICellRendererProps<unknown>) {
  return (
    <view style={style} onLayout={onLayout} onFocus={onFocus} className="parity-cell-frame">
      {children}
    </view>
  );
}

function CellRenderer() {
  return (
    <ParityCard
      title="CellRendererComponent"
      rn="the component replaces the view around each cell"
      look="every row sits inside a green frame, and the list still measures and scrolls"
    >
      <FlatList
        data={ROWS}
        keyExtractor={rowIdOf}
        renderItem={renderPlainRow}
        CellRendererComponent={FramedCell}
        className="parity-list"
      />
    </ParityCard>
  );
}

type IVirtualizationProps = { isDisabled: boolean };

// Counts the cells the list asked for, which is what it mounted
function MountedCounter({ isDisabled }: IVirtualizationProps) {
  const seen = useRef(new Set<string>());
  const [count, setCount] = useState<number | null>(null);
  return (
    <>
      <FlatList
        data={MANY_ROWS}
        keyExtractor={rowIdOf}
        renderItem={({ item }) => {
          seen.current.add(item.id);
          return renderPlainRow({ item });
        }}
        disableVirtualization={isDisabled}
        className="parity-list"
      />
      <ActionButton
        title={`Count cells (${isDisabled ? 'disabled' : 'windowed'})`}
        color={PARITY_COLOR}
        onPress={() => setCount(seen.current.size)}
      />
      <text className="parity-detail">{`cells asked for: ${count ?? 'tap Count'} of ${MANY_COUNT}`}</text>
    </>
  );
}

function VirtualizationWindow() {
  return (
    <ParityCard
      title="disableVirtualization"
      rn="the window starts at the top and grows by maxToRenderPerBatch near the end"
      look="windowed counts a screenful, disabled counts more and grows as you scroll down"
    >
      <MountedCounter isDisabled={false} />
      <MountedCounter isDisabled />
    </ParityCard>
  );
}

const ItemSeparator = () => <view className="parity-sep-item" />;
const SectionEdge = () => <view className="parity-sep-section" />;

function renderParityHeader({ section }: { section: ISection<IRow> }) {
  return <text className="parity-section-head">{`Section ${section.title}`}</text>;
}

function SectionSeparators() {
  return (
    <ParityCard
      title="SectionList separators"
      rn="the section separator frames a section, the item one sits between two items only"
      look="thin red between the two rows of a section, thick blue at section edges, none by a header"
    >
      <SectionList
        sections={SECTIONS}
        keyExtractor={rowIdOf}
        renderItem={renderPlainRow}
        renderSectionHeader={renderParityHeader}
        ItemSeparatorComponent={ItemSeparator}
        SectionSeparatorComponent={SectionEdge}
        className="parity-list"
      />
    </ParityCard>
  );
}

function KeyboardOnScrollView() {
  const [log, setLog] = useState<string[]>([]);
  const note = (name: string) => () => setLog(entries => [name, ...entries].slice(0, 4));
  return (
    <ParityCard
      title="ScrollView keyboard callbacks"
      rn="onKeyboardWillShow, WillHide, DidShow and DidHide fire with the keyboard event"
      look="focus the field and dismiss: DidShow then DidHide (iOS adds the Will ones)"
    >
      <scroll-view
        onKeyboardWillShow={note('willShow')}
        onKeyboardDidShow={note('didShow')}
        onKeyboardWillHide={note('willHide')}
        onKeyboardDidHide={note('didHide')}
        className="parity-list"
      >
        <text-input
          placeholder="focus me"
          placeholderTextColor={INPUT_HINT}
          className="text-input"
        />
      </scroll-view>
      <text className="parity-detail">{log.join(' <- ') || 'no keyboard event yet'}</text>
    </ParityCard>
  );
}

export function ListSlotsParity() {
  return (
    <>
      <InvertedSlots />
      <CellRenderer />
      <VirtualizationWindow />
      <SectionSeparators />
      <KeyboardOnScrollView />
    </>
  );
}
