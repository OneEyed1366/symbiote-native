<!--
  customRef() — the canonical debounced-ref use case from Vue's own docs. `track()`/`trigger()`
  give explicit control over WHEN a dependency read/write is reported to the reactivity system,
  which is exactly what a debounce needs: every keystroke updates the underlying value immediately
  (so the raw `v-model` text never lags), but `trigger()` — the signal that makes anything WATCHING
  this ref re-render — only fires after the debounce window elapses.
-->
<script setup lang="ts">
import { customRef } from 'vue';

const DEBOUNCE_MS = 400;

function useDebouncedRef(initial: string, delay: number) {
  let value = initial;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return customRef<string>((track, trigger) => ({
    get() {
      track();
      return value;
    },
    set(newValue) {
      value = newValue;
      clearTimeout(timer);
      timer = setTimeout(() => trigger(), delay);
    },
  }));
}

const debounced = useDebouncedRef('', DEBOUNCE_MS);
</script>

<template>
  <view class="a11y-card">
    <text class="switch-label">customRef() — debounced v-model</text>
    <text-input
      testID="customref-input"
      class="focus-input"
      placeholder="type here…"
      v-model="debounced"
    />
    <text class="note-text" testID="customref-committed">{{
      `debounced (committed ${DEBOUNCE_MS}ms after typing stops) = "${debounced}"`
    }}</text>
  </view>
</template>
