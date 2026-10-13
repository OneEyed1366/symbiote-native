import { createSignal, type Accessor } from 'solid-js';
import Animated, {
  FadeIn,
  LinearTransition,
} from '@symbiote-native/reanimated/solid';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR } from './colors';
import { Section } from './Section';

const FIRST_ROWS = 3;
const DIMMED = 0.6;

type IRow = { id: string };

const keyOf = (row: IRow) => row.id;

// A Solid list hands the row an accessor over the info, so it follows the item
function renderFadingRow(info: Accessor<{ item: IRow }>) {
  return (
    <view class="ra-item" {...{ entering: FadeIn }}>
      <text class="ra-item-text">{`item ${info().item.id}`}</text>
    </view>
  );
}

// Every other row is dimmed by the cell style, which gets the item and its index
function tintOfRow({ index }: { item: unknown; index: number }) {
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
  const [rows, setRows] = createSignal(startingRows());

  return (
    <Section
      title="Animated.FlatList"
      note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
    >
      <Animated.FlatList
        testID="ra-flat-list"
        class="ra-list"
        data={rows()}
        keyExtractor={keyOf}
        renderItem={renderFadingRow}
        itemLayoutAnimation={LinearTransition}
        CellRendererComponentStyle={tintOfRow}
        skipEnteringExitingAnimations
      />
      <ActionButton
        testID="ra-list-add"
        title="add row"
        onPress={() => setRows([...rows(), { id: String(rows().length) }])}
        color={GO_COLOR}
      />
    </Section>
  );
}
