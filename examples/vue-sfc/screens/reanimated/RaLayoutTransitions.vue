<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import Reanimated, {
  CurvedTransition,
  EntryExitTransition,
  FadeIn,
  FadeOut,
  FadingTransition,
  JumpingTransition,
  LinearTransition,
  SequencedTransition,
  type ILayoutAnimationBuilder,
} from '@symbiote-native/reanimated/vue';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { ACCENT, GO_COLOR, NEXT_COLOR, STOP_COLOR } from './constants';

const FIRST_ROWS = 4;

type ITransition = { name: string; layout: ILayoutAnimationBuilder };

const LINEAR: ITransition = { name: 'Linear', layout: LinearTransition };

const TRANSITIONS: readonly ITransition[] = [
  LINEAR,
  { name: 'Fading', layout: FadingTransition },
  { name: 'Sequenced', layout: SequencedTransition },
  { name: 'Jumping', layout: JumpingTransition },
  { name: 'Curved', layout: CurvedTransition },
  {
    name: 'EntryExit',
    layout: EntryExitTransition.entering(FadeIn).exiting(FadeOut),
  },
];

// Rows that move when the list changes: the layout prop animates the move, entering and exiting
// animate the rows that come and go
const rows = ref(Array.from({ length: FIRST_ROWS }, (_, index) => index));
const transition = shallowRef(LINEAR);
const transitionNote = computed(() => `transition: ${transition.value.name}`);
let nextRow = FIRST_ROWS;

const add = () => {
  rows.value = [nextRow, ...rows.value];
  nextRow += 1;
};

const shuffle = () => {
  rows.value = [...rows.value.slice(1), ...rows.value.slice(0, 1)];
};

const nextTransition = () => {
  const at = TRANSITIONS.indexOf(transition.value);
  transition.value = TRANSITIONS[(at + 1) % TRANSITIONS.length] ?? LINEAR;
};
</script>

<template>
  <RaSection
    title="Layout transitions"
    note="Linear, Fading, Sequenced, Jumping and Curved, on rows that shuffle, join and leave"
  >
    <text class="ra-note">{{ transitionNote }}</text>
    <view class="ra-list">
      <Reanimated.View
        v-for="row in rows"
        :key="row"
        :testID="`ra-row-${row}`"
        class="ra-item"
        :layout="transition.layout"
        :entering="FadeIn"
        :exiting="FadeOut"
      >
        <text class="ra-item-text">row {{ row }}</text>
      </Reanimated.View>
    </view>
    <view class="ra-wrap">
      <ActionButton
        testID="ra-layout-shuffle"
        title="shuffle"
        :onPress="shuffle"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-layout-add"
        title="add"
        :onPress="add"
        :color="GO_COLOR"
      />
      <ActionButton
        testID="ra-layout-remove"
        title="remove"
        :onPress="() => (rows = rows.slice(1))"
        :color="STOP_COLOR"
      />
      <ActionButton
        testID="ra-layout-next"
        title="next transition"
        :onPress="nextTransition"
        :color="NEXT_COLOR"
      />
    </view>
  </RaSection>
</template>
