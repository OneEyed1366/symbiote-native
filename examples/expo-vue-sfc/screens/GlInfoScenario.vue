<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { readGpuInfo } from './gl-headless';
import type { IInfoResult } from './gl-headless';

defineProps<{ color: string }>();

const NOT_READ = 'not read';
const result = shallowRef<IInfoResult>({ info: null, line: 'logging off' });
const version = computed(() => result.value.info?.version ?? NOT_READ);
const renderer = computed(() => result.value.info?.renderer ?? NOT_READ);
const vendor = computed(() => result.value.info?.vendor ?? NOT_READ);
const maxTexture = computed(() => result.value.info?.maxTexture ?? NOT_READ);

async function read(): Promise<void> {
  const next = await readGpuInfo();
  result.value = { info: next.info ?? result.value.info, line: next.line };
}
</script>

<template>
  <Card
    testID="gl-info-card"
    title="What this GPU offers, and call logging"
  >
    <text class="hero-body">
      Apps check the limits before choosing a texture size, and turn on call logging to debug a black view. Logging prints to the Metro console with console.warn.
    </text>
    <ActionButton
      testID="gl-info"
      title="Read GPU info and log two calls"
      :color="color"
      @press="read"
    />
    <ResultRow
      testID="gl-info-version"
      label="VERSION"
      :value="version"
    />
    <ResultRow
      testID="gl-info-renderer"
      label="RENDERER"
      :value="renderer"
    />
    <ResultRow
      testID="gl-info-vendor"
      label="VENDOR"
      :value="vendor"
    />
    <ResultRow
      testID="gl-info-max-texture"
      label="MAX_TEXTURE_SIZE"
      :value="maxTexture"
    />
    <ResultRow
      testID="gl-info-logging"
      label="__expoSetLogging"
      :value="result.line"
    />
    <text class="hero-body">
      Not shown here: getWorkletContext hands the context to a Reanimated worklet thread.
    </text>
  </Card>
</template>
