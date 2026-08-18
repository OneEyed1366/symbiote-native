<!--
  <Suspense> around a genuinely async setup() component — also unproven against Fabric before this
  screen (same 2026-08-17 decision as KeepAliveDemo.vue). AsyncPayload's setup() is itself an async
  function that awaits a simulated fetch, which is exactly the "async setup()" case <Suspense>
  exists to coordinate: the fallback slot shows until that promise resolves, then Suspense swaps to
  the real content in one commit.

  `:key="loadKey"` on AsyncPayload forces a fresh mount (and therefore a fresh pending promise) on
  each "Reload" press — without it Vue would just keep the already-resolved instance around and the
  fallback would never be seen again after the first load.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';
import AsyncPayload from './AsyncPayload.vue';

const loadKey = ref(0);
</script>

<template>
  <View class="section-tight">
    <Text class="section-label"
      >&lt;Suspense&gt; + an async setup() component</Text
    >
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
        <View class="a11y-card">
          <Text class="note-text" testID="suspense-fallback"
            >loading async payload…</Text
          >
        </View>
      </template>
    </Suspense>
  </View>
</template>
