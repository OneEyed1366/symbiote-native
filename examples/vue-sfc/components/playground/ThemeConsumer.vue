<!--
  inject()'s reactive half — must be called synchronously in setup(), so it's a top-level
  `const theme = inject(...)` call, not something wired up conditionally or inside a handler.
  Self-nests up to 3 levels deep (via its own `depth` prop) so the injected value is shown crossing
  a REAL descendant chain, not just a direct parent→child hop — provide() (in ApiPlaygroundScreen.vue)
  is only called once, at the top.

  hasInjectionContext() and getCurrentInstance() are advanced/library-author escape hatches per
  Vue's own docs — both surfaced here as plain read-only display since there is no per-app behavior
  to toggle, only a value to observe.
-->
<script setup lang="ts">
import { inject, hasInjectionContext, getCurrentInstance } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import { THEME_KEY } from './provide-keys';

const props = defineProps<{ depth: number }>();

const theme = inject(THEME_KEY);
const hadContext = hasInjectionContext();
const instanceName = getCurrentInstance()?.type.name ?? 'unnamed';
</script>

<template>
  <View class="a11y-card" :style="{ borderWidth: 1, borderColor: '#f5a623' }">
    <Text class="note-text" :testID="`theme-consumer-depth-${depth}`">{{
      theme === undefined
        ? `depth ${depth}: no theme provided`
        : `depth ${depth}: injected tone = "${theme.tone}" · hasInjectionContext()=${hadContext} · instance=${instanceName}`
    }}</Text>
    <ThemeConsumer v-if="depth < 2" :depth="depth + 1" />
  </View>
</template>
