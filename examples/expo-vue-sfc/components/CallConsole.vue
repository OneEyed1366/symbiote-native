<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from './ActionButton.vue';
import Card from './Card.vue';
import { slug, summarize } from './call-console';
import type { ICall } from './call-console';

// One button per API call, the shared output line shows the resolved value or the error.
// `isBare` renders the console inside a Scenario, without a card of its own
defineProps<{
  prefix: string;
  title: string;
  calls: readonly ICall[];
  color: string;
  hint?: string;
  isBare?: boolean;
}>();

const output = ref('no call yet');

function invoke(call: ICall): void {
  output.value = `${call.label}…`;
  Promise.resolve()
    .then(call.run)
    .then(value => {
      output.value = `${call.label} ->\n${summarize(value)}`;
    })
    .catch((error: Error) => {
      output.value = `${call.label} failed: ${error.message}`;
    });
}
</script>

<template>
  <view v-if="isBare === true" :testID="`${prefix}-card`" class="console-bare">
    <text v-if="hint !== undefined" class="info-text">{{ hint }}</text>
    <view class="button-row">
      <ActionButton
        v-for="call in calls"
        :key="call.label"
        :testID="`${prefix}-${slug(call.label)}`"
        :title="call.label"
        :onPress="() => invoke(call)"
        :color="color"
      />
    </view>
    <text :testID="`${prefix}-output`" class="info-text">{{ output }}</text>
  </view>
  <Card v-else :testID="`${prefix}-card`" :title="title">
    <text v-if="hint !== undefined" class="info-text">{{ hint }}</text>
    <view class="button-row">
      <ActionButton
        v-for="call in calls"
        :key="call.label"
        :testID="`${prefix}-${slug(call.label)}`"
        :title="call.label"
        :onPress="() => invoke(call)"
        :color="color"
      />
    </view>
    <text :testID="`${prefix}-output`" class="info-text">{{ output }}</text>
  </Card>
</template>
