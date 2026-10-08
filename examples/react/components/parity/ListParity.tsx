import { useRef, useState } from 'react';
import { FlatList } from '@symbiote-native/react';
import type { IFlatListHandle } from '@symbiote-native/react';
import { ActionButton } from '../ActionButton';
import { PARITY_COLOR, ParityCard } from './ParityCard';
import { ROWS, rowIdOf, renderPlainRow } from './list-rows';

const MARKED_STYLE = { backgroundColor: '#41506a' };

// RN draws a cell from this component, `item`, `index` and `separators` are its props
function ListItemRow({ item, index }: { item: { label: string }; index: number }) {
  const tint = index % 2 === 0 ? 'parity-tint-a' : 'parity-tint-b';
  return (
    <view className={`parity-list-row ${tint}`}>
      <text className="parity-text">{`${item.label} drawn by ListItemComponent`}</text>
    </view>
  );
}

function ListItemComponentCard() {
  return (
    <ParityCard
      title="FlatList ListItemComponent"
      rn="a component draws each cell from item, index and separators"
      look="every row reads 'drawn by ListItemComponent' with alternating tints"
    >
      <FlatList
        data={ROWS}
        keyExtractor={rowIdOf}
        ListItemComponent={ListItemRow}
        className="parity-list"
      />
    </ParityCard>
  );
}

// The handle hands out the scroll node itself, so it measures and takes native props
function HandleCard() {
  const listRef = useRef<IFlatListHandle>(null);
  const [report, setReport] = useState('nothing asked yet');
  const [hasInner, setHasInner] = useState(false);
  const [isMarked, setIsMarked] = useState(false);
  const measure = () => {
    listRef.current?.getNativeScrollRef()?.measure((_x, _y, width, height) => {
      setReport(`getNativeScrollRef().measure -> ${width} x ${height}`);
    });
  };
  const mark = () => {
    listRef.current?.setNativeProps({ style: isMarked ? null : MARKED_STYLE });
    setIsMarked(value => !value);
  };
  const scrollToNaN = () => {
    listRef.current?.getScrollRef()?.scrollTo({ y: NaN, animated: false });
  };
  return (
    <ParityCard
      title="List handle: scroll ref, setNativeProps, innerViewRef"
      rn="the handle answers getNativeScrollRef, getScrollRef and setNativeProps"
      look="scroll down, then: Measure prints a size, Mark repaints, scrollTo NaN returns to the top"
    >
      <FlatList
        ref={listRef}
        data={ROWS}
        keyExtractor={rowIdOf}
        renderItem={renderPlainRow}
        innerViewRef={node => setHasInner(node !== null)}
        className="parity-list"
      />
      <view className="row">
        <ActionButton title="Measure" color={PARITY_COLOR} onPress={measure} />
        <ActionButton title="Mark" color={PARITY_COLOR} onPress={mark} />
        <ActionButton title="scrollTo NaN" color={PARITY_COLOR} onPress={scrollToNaN} />
      </view>
      <text className="parity-detail">{report}</text>
      <text className="parity-detail">{`innerViewRef got the content view: ${hasInner}`}</text>
    </ParityCard>
  );
}

// Lengths and offsets measured along one axis are dropped when the axis changes
function OrientationCard() {
  const [isHorizontal, setIsHorizontal] = useState(false);
  return (
    <ParityCard
      title="A live list changes orientation"
      rn="measurements taken along the old axis are dropped on a horizontal change"
      look="flip it twice: every row stays laid out on the new axis, no gap and no blank area"
    >
      <ActionButton
        title={isHorizontal ? 'Make vertical' : 'Make horizontal'}
        color={PARITY_COLOR}
        onPress={() => setIsHorizontal(value => !value)}
      />
      <FlatList
        data={ROWS}
        keyExtractor={rowIdOf}
        renderItem={renderPlainRow}
        horizontal={isHorizontal}
        className={isHorizontal ? 'parity-list-wide' : 'parity-list'}
      />
    </ParityCard>
  );
}

export function ListParity() {
  return (
    <>
      <ListItemComponentCard />
      <HandleCard />
      <OrientationCard />
    </>
  );
}
