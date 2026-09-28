<!-- <Suspense> around a genuinely async setup() component: AsyncPayload awaits a simulated fetch,
  the case <Suspense> exists to coordinate — fallback shows until the promise resolves, then
  Suspense swaps to real content in one commit. -->

<!-- `:key="loadKey"` on AsyncPayload forces a fresh mount (and pending promise) on each "Reload"
  press — without it Vue keeps the resolved instance and the fallback never shows again. -->
<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from '../ActionButton.vue';
import AsyncPayload from './AsyncPayload.vue';

const loadKey = ref(0);
</script>

<template>
  <view class="section-tight">
    <text class="section-label">
      &lt;Suspense&gt; + an async setup() component
    </text>
    <ActionButton
      testID="suspense-reload"
      title="Reload async content"
      :onPress="() => (loadKey += 1)"
      color="#f5a623"
    />
    <Suspense>
      <template #default>
        <AsyncPayload :key="loadKey" />
      </template>
      <template #fallback>
        <view class="a11y-card">
          <text class="note-text" testID="suspense-fallback">
            loading async payload…
          </text>
        </view>
      </template>
    </Suspense>
  </view>
</template>
