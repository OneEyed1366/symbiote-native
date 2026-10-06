<script setup lang="ts">
import { shallowRef } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { renderOffscreen } from './gl-headless';
import type { IHeadlessResult } from './gl-headless';

defineProps<{ color: string }>();

const result = shallowRef<IHeadlessResult>({ snapshot: null, line: 'not run' });

async function run(): Promise<void> {
  result.value = { snapshot: result.value.snapshot, line: 'rendering…' };
  const next = await renderOffscreen();
  result.value = { snapshot: next.snapshot ?? result.value.snapshot, line: next.line };
}
</script>

<template>
  <Scenario
    testID="gl-headless-scenario"
    title="Render an image with no view on screen"
    why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
    :steps="['Press Render offscreen']"
    expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
  >
    <ActionButton
      testID="gl-headless-run"
      title="Render offscreen"
      :color="color"
      @press="run"
    />
    <ResultRow
      testID="gl-headless-result"
      label="createContextAsync"
      :value="result.line"
    />
    <image
      v-if="result.snapshot !== null"
      testID="gl-headless-image"
      :source="{ uri: result.snapshot.localUri }"
      class="gl-snapshot"
    />
  </Scenario>
</template>
