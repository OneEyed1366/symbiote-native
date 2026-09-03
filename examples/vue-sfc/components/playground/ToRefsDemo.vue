<!--
  toRef()/toRefs() — converting a reactive object's properties into individual refs that stay
  synced with the source object, surviving destructuring (plain destructuring of a reactive()
  object loses reactivity; toRefs() is the documented fix). `label` (toRef, single property) and
  `score` (via toRefs' destructure) both stay linked back to the same underlying `state` object.
-->
<script setup lang="ts">
import { reactive, toRef, toRefs } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

const state = reactive({ label: 'unchanged', score: 0 });
const label = toRef(state, 'label');
const { score } = toRefs(state);

function bumpScore(): void {
  score.value += 1;
}

function relabel(): void {
  state.label =
    state.label === 'unchanged' ? 'relabeled via state.label' : 'unchanged';
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label">toRef + toRefs</Text>
    <Text class="list-row-text" testID="torefs-values">{{
      `toRef(state,'label')=${label} · toRefs(state).score=${score} · state.score=${state.score}`
    }}</Text>
    <View class="row-tight">
      <ActionButton
        testID="torefs-bump-score"
        title="score.value++"
        :onPress="bumpScore"
        color="#f5a623"
      />
      <ActionButton
        testID="torefs-relabel"
        title="mutate state.label"
        :onPress="relabel"
        color="#f5a623"
      />
    </View>
  </View>
</template>
