<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import ActionButton from '../../components/ActionButton.vue';
import CounterCapsule from '../../components/playground/CounterCapsule.vue';
import UseModelProbe from '../../components/playground/UseModelProbe.vue';
import OptionsApiChild from '../../components/playground/OptionsApiChild.vue';
import { ACCENT } from './accent';
import { appendLimited } from './log';

const PING_LOG_LIMIT = 4;

const capsuleRef =
  useTemplateRef<InstanceType<typeof CounterCapsule>>('capsuleRef');
const capsuleCount = ref(0);
const isCapsuleThresholdHit = ref(false);
const useModelCount = ref(0);
const pingLog = ref<string[]>([]);

function resetCapsule(): void {
  capsuleRef.value?.reset();
  isCapsuleThresholdHit.value = false;
}
function onPing(value: number): void {
  appendLimited(pingLog, `ping: ${value}`, PING_LOG_LIMIT);
}
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Component Communication </text>
    <CounterCapsule
      ref="capsuleRef"
      v-model:count="capsuleCount"
      data-note="fallthrough-demo"
      @threshold="isCapsuleThresholdHit = true"
    />
    <text
      v-if="isCapsuleThresholdHit"
      class="note-text"
      testID="capsule-threshold"
    >
      threshold event fired — count reached 10
    </text>
    <ActionButton
      testID="capsule-reset"
      title="reset() via defineExpose + template ref"
      :onPress="resetCapsule"
      :color="ACCENT"
    />

    <UseModelProbe v-model:count="useModelCount" />

    <OptionsApiChild
      :seed="42"
      data-note="options-fallthrough"
      @ping="onPing"
    >
      <text class="note-text"> passed via default slot </text>
    </OptionsApiChild>
    <text v-for="(entry, index) in pingLog" :key="index" class="list-row-text">
      {{ entry }}
    </text>
  </view>
</template>
