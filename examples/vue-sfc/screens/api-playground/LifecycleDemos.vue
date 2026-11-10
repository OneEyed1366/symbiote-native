<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';
import ActionButton from '../../components/ActionButton.vue';
import LifecycleLogChild from '../../components/playground/LifecycleLogChild.vue';
import { ACCENT } from './accent';
import { appendLimited } from './log';

const HOOK_LOG_LIMIT = 10;
const CAPTURED_LIMIT = 4;

const isMounted = ref(false);
const seed = ref(0);
const hookLog = ref<string[]>([]);
const capturedErrors = ref<string[]>([]);

function pushHookLog(entry: string): void {
  appendLimited(hookLog, entry, HOOK_LOG_LIMIT);
}

// Does not return `false`, so the error still reaches `app.config.errorHandler`
onErrorCaptured(error => {
  appendLimited(
    capturedErrors,
    `onErrorCaptured: ${error instanceof Error ? error.message : String(error)}`,
    CAPTURED_LIMIT,
  );
});
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Lifecycle Hooks </text>
    <view class="row-tight">
      <ActionButton
        testID="lifecycle-mount-toggle"
        :title="isMounted ? 'Unmount child' : 'Mount child'"
        :onPress="() => (isMounted = !isMounted)"
        :color="ACCENT"
      />
      <ActionButton
        testID="lifecycle-bump-seed"
        title="bump seed (onBeforeUpdate/onUpdated)"
        :onPress="() => (seed += 1)"
        :color="ACCENT"
      />
    </view>
    <LifecycleLogChild v-if="isMounted" :seed="seed" @log="pushHookLog" />
    <text class="section-label"> hook log </text>
    <text v-for="(entry, index) in hookLog" :key="index" class="list-row-text">
      {{ entry }}
    </text>
    <text class="section-label">
      onErrorCaptured (this section's own hook, does not stop propagation)
    </text>
    <text
      v-for="(entry, index) in capturedErrors"
      :key="index"
      class="list-row-text"
    >
      {{ entry }}
    </text>
  </view>
</template>
