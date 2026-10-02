<script setup lang="ts">
// One user task: what it is for, what to do on the device, what must be seen afterwards
defineProps<{
  testID: string;
  title: string;
  why: string;
  steps: readonly string[];
  expect: string;
}>();
</script>

<template>
  <view
    :testID="testID"
    class="scenario-card"
  >
    <text class="scenario-title">
      {{ title }}
    </text>
    <text class="scenario-why">
      {{ why }}
    </text>
    <view class="scenario-steps">
      <text
        v-for="(step, index) in steps"
        :key="step"
        class="scenario-step"
      >
        {{
          `${index + 1}. ${step}`
        }}
      </text>
    </view>
    <slot />
    <view class="scenario-expect">
      <text class="scenario-expect-label">
        Expected
      </text>
      <text class="scenario-expect-text">
        {{ expect }}
      </text>
    </view>
  </view>
</template>
