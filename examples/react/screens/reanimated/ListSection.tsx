import { useState } from 'react';
import Animated, { FadeIn } from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const FIRST_ROWS = 3;
const ADD_COLOR = '#6ad48b';

type IRow = { id: string };

const keyOf = (row: IRow) => row.id;

function renderFadingRow({ item }: { item: IRow }) {
  return (
    <Animated.View entering={FadeIn} className="ra-item">
      <text className="ra-item-text">{`item ${item.id}`}</text>
    </Animated.View>
  );
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
      note="skipEnteringExitingAnimations: the first rows appear at once, an added one fades in"
    >
      <Animated.FlatList
        testID="ra-flat-list"
        className="ra-list"
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderFadingRow}
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
