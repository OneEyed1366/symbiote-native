<script setup lang="ts">
import { ref } from 'vue';
import Reanimated, {
  FadeIn,
  LinearTransition,
} from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { GO_COLOR } from './constants';

const FIRST_ROWS = 3;
const DIMMED = 0.6;

type IRow = { id: string };

const keyOf = (row: IRow) => row.id;

// Every other row is dimmed by the cell style, which gets the item and its index
const tintOfRow = ({ index }: { item: unknown; index: number }) => ({
  opacity: index % 2 === 0 ? 1 : DIMMED,
});

// The rows that are there when the list mounts skip their entering animation, a row added later
// plays it
const rows = ref<IRow[]>(
  Array.from({ length: FIRST_ROWS }, (_, index) => ({ id: String(index) })),
);

const addRow = () => {
  rows.value = [...rows.value, { id: String(rows.value.length) }];
};
</script>

<template>
  <RaSection
    title="Animated.FlatList"
    note="first rows appear at once, an added one fades in, the rest slide; odd rows are dimmed"
  >
    <Reanimated.FlatList
      testID="ra-flat-list"
      class="ra-list"
      :data="rows"
      :keyExtractor="keyOf"
      :itemLayoutAnimation="LinearTransition"
      :cellRendererComponentStyle="tintOfRow"
      skipEnteringExitingAnimations
    >
      <template #item="{ item }">
        <Reanimated.View :entering="FadeIn" class="ra-item">
          <text class="ra-item-text">item {{ item.id }}</text>
        </Reanimated.View>
      </template>
    </Reanimated.FlatList>
    <ActionButton
      testID="ra-list-add"
      title="add row"
      :onPress="addRow"
      :color="GO_COLOR"
    />
  </RaSection>
</template>
