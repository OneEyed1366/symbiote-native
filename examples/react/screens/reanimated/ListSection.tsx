import { useState } from 'react';
import Animated, {
  FadeIn,
  LinearTransition,
} from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const FIRST_ROWS = 3;
const ADD_COLOR = '#6ad48b';
const DIMMED = 0.6;

type IRow = { id: string };

const keyOf = (row: IRow) => row.id;

function renderFadingRow({ item }: { item: IRow }) {
  return (
    <Animated.View entering={FadeIn} className="ra-item">
      <text className="ra-item-text">{`item ${item.id}`}</text>
    </Animated.View>
  );
}

// Every other row is dimmed by the cell style, which gets the item and its index
function tintOfRow({ index }: { item: IRow; index: number }) {
  return { opacity: index % 2 === 0 ? 1 : DIMMED };
}

function startingRows(): IRow[] {
  return Array.from({ length: FIRST_ROWS }, (_, index) => ({
    id: String(index),
  }));
}

// The rows that are there when the list mounts skip their entering animation, a row added later
// plays it
export function FlatListSection() {
  const [rows, setRows] = useState(startingRows);

  return (
    <Section
      title="Animated.FlatList"
      note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
    >
      <Animated.FlatList
        testID="ra-flat-list"
        className="ra-list"
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderFadingRow}
        itemLayoutAnimation={LinearTransition}
        CellRendererComponentStyle={tintOfRow}
        skipEnteringExitingAnimations
      />
      <ActionButton
        testID="ra-list-add"
        title="add row"
        onPress={() => setRows([...rows, { id: String(rows.length) }])}
        color={ADD_COLOR}
      />
    </Section>
  );
}
