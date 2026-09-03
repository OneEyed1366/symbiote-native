<!--
  effectScope()/getCurrentScope()/onScopeDispose() — a scope that groups the watchers/computeds
  created inside `scope.run(...)` so they can be torn down together. "Start" creates the scope and
  a watchEffect inside it that reacts to `ticks`; "stop" calls `scope.stop()`, which disposes that
  watchEffect (onScopeDispose fires) — after stopping, bumping `ticks` again no longer produces a
  new log line, proving the watcher genuinely stopped, not just paused.
-->
<script setup lang="ts">
import {
  ref,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  watchEffect,
  type EffectScope,
} from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

// Only meaningful when read synchronously during setup() — a component's own setup() runs
// inside an effect scope Vue creates for it, so this is `true` by construction here.
const hadScopeAtSetup = getCurrentScope() !== undefined;

const ticks = ref(0);
const log = ref<string[]>([]);
let scope: EffectScope | undefined;

// `history` is a plain array, deliberately: reading `log.value` here would make every
// `watchEffect` below TRACK the ref this function then WRITES, so each effect would re-trigger
// itself until Vue reports "Maximum recursive updates exceeded". Writing a ref does not track it —
// only reading does — so the history stays off the reactive graph and each effect fires on its own
// source instead of on the log.
const history: string[] = [];

function pushLog(entry: string): void {
  history.push(entry);
  if (history.length > 6) history.shift();
  log.value = [...history];
}

function startScope(): void {
  if (scope) return;
  scope = effectScope();
  scope.run(() => {
    watchEffect(() => pushLog(`scope watchEffect: ticks=${ticks.value}`));
    onScopeDispose(() => pushLog('onScopeDispose fired'));
  });
}

function stopScope(): void {
  scope?.stop();
  scope = undefined;
}

function bumpTicks(): void {
  ticks.value += 1;
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label"
      >effectScope + getCurrentScope + onScopeDispose</Text
    >
    <Text class="note-text" testID="effectscope-had-scope">{{
      `getCurrentScope() at setup() !== undefined: ${hadScopeAtSetup}`
    }}</Text>
    <View class="row-tight">
      <ActionButton
        testID="effectscope-start"
        title="start scope"
        :onPress="startScope"
        color="#f5a623"
      />
      <ActionButton
        testID="effectscope-stop"
        title="stop scope"
        :onPress="stopScope"
        color="#f5a623"
      />
      <ActionButton
        testID="effectscope-bump"
        title="bump ticks"
        :onPress="bumpTicks"
        color="#f5a623"
      />
    </View>
    <Text v-for="(entry, index) in log" :key="index" class="list-row-text">{{
      entry
    }}</Text>
  </View>
</template>
