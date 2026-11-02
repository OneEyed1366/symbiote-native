<script setup lang="ts">
import { ref, reactive, provide, inject } from 'vue';
import ActionButton from '../../components/ActionButton.vue';
import {
  THEME_KEY,
  DIRECT_PROVIDE_KEY,
  type ITheme,
} from '../../components/playground/provide-keys';
import ThemeConsumer from '../../components/playground/ThemeConsumer.vue';
import NextTickProbe from '../../components/playground/NextTickProbe.vue';
import { ACCENT } from './accent';
import { appendLimited } from './log';

const NEXT_TICK_LOG_LIMIT = 6;

const theme = reactive<ITheme>({ tone: 'warm amber' });
provide(THEME_KEY, theme);

const nextTickLog = ref<string[]>([]);
const probeMountCount = ref(0);
const directProvideValue = inject(DIRECT_PROVIDE_KEY, 'not provided');

function switchThemeTone(): void {
  theme.tone = theme.tone === 'warm amber' ? 'cool violet' : 'warm amber';
}
function pushNextTickResult(entry: string): void {
  appendLimited(nextTickLog, entry, NEXT_TICK_LOG_LIMIT);
}
</script>

<template>
  <view class="section-nested">
    <text class="section-header">
      Composition API / Dependency Injection
    </text>
    <text class="section-label">
      provide() + inject() (3 levels deep) + hasInjectionContext() +
      getCurrentInstance()
    </text>
    <ActionButton
      testID="theme-toggle"
      :title="`toggle theme (currently: ${theme.tone})`"
      :onPress="switchThemeTone"
      :color="ACCENT"
    />
    <ThemeConsumer :depth="0" />
    <text class="section-label">
      nextTick() (Partial) vs whenCommitted() — same async-commit gotcha as
      onMounted
    </text>
    <ActionButton
      testID="nexttick-mount-probe"
      title="mount fresh probe node"
      :onPress="() => (probeMountCount += 1)"
      :color="ACCENT"
    />
    <NextTickProbe
      v-if="probeMountCount > 0"
      :key="probeMountCount"
      @result="pushNextTickResult"
    />
    <text
      v-for="(entry, index) in nextTickLog"
      :key="index"
      class="list-row-text"
    >
      {{ entry }}
    </text>
    <text class="note-text">
      direct app.provide() (installed in this screen's own setup):
      {{ directProvideValue }}
    </text>
  </view>
</template>
