import { defineComponent, ref } from 'vue';
import Reanimated, {
  FadeIn,
  LinearTransition,
} from '@symbiote-native/reanimated/vue';
import { ActionButton } from '../../components/ActionButton';
import { GO_COLOR } from './colors';
import { Section } from './Section';

const FIRST_ROWS = 3;
const DIMMED = 0.6;

type IRow = { id: string };

const keyOf = (row: IRow) => row.id;

// Every other row is dimmed by the cell style, which gets the item and its index
const tintOfRow = ({ index }: { item: unknown; index: number }) => ({
  opacity: index % 2 === 0 ? 1 : DIMMED,
});

function startingRows(): IRow[] {
  return Array.from({ length: FIRST_ROWS }, (_, index) => ({
    id: String(index),
  }));
}

// The rows that are there when the list mounts skip their entering animation, a row added later
// plays it
export const FlatListSection = defineComponent(() => {
  const rows = ref(startingRows());

  const addRow = () => {
    rows.value = [...rows.value, { id: String(rows.value.length) }];
  };

  return () => (
    <Section
      title="Animated.FlatList"
      note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
    >
      <Reanimated.FlatList
        testID="ra-flat-list"
        class="ra-list"
        data={rows.value}
        keyExtractor={keyOf}
        itemLayoutAnimation={LinearTransition}
        cellRendererComponentStyle={tintOfRow}
        skipEnteringExitingAnimations
      >
        {{
          item: ({ item }: { item: IRow }) => (
            <Reanimated.View entering={FadeIn} class="ra-item">
              <text class="ra-item-text">{`item ${item.id}`}</text>
            </Reanimated.View>
          ),
        }}
      </Reanimated.FlatList>
      <ActionButton
        testID="ra-list-add"
        title="add row"
        onPress={addRow}
        color={GO_COLOR}
      />
    </Section>
  );
});
