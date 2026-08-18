<!--
  shallowRef()/triggerRef() — the exact primitive vue-adapter-reactivity documents as the fix for
  holding an engine node by identity (Switch's host-node ref uses it for real). `.value` access is
  reactive, but MUTATING a field on the held object is not tracked — "mutate silently" changes
  `box.value.tick` without touching `.value` itself, so no re-render happens and the number on
  screen stays stale until `triggerRef()` forces one. This component is deliberately its own
  isolated instance (not merged into a bigger demo) so no OTHER widget's re-render can incidentally
  repaint this one and hide the staleness.
-->
<script setup lang="ts">
import { shallowRef, triggerRef } from 'vue';
import { View, Text } from '@symbiote-native/vue';
import ActionButton from '../ActionButton.vue';

const box = shallowRef({ tick: 0 });

function mutateSilently(): void {
  box.value.tick += 1;
}

function mutateAndTrigger(): void {
  box.value.tick += 1;
  triggerRef(box);
}
</script>

<template>
  <View class="a11y-card">
    <Text class="switch-label">shallowRef + triggerRef</Text>
    <Text class="list-row-text" testID="shallowref-tick">{{
      `box.value.tick (as last rendered) = ${box.tick}`
    }}</Text>
    <View class="row-tight">
      <ActionButton
        testID="shallowref-mutate-silent"
        title="mutate silently"
        :onPress="mutateSilently"
        color="#f5a623"
      />
      <ActionButton
        testID="shallowref-mutate-trigger"
        title="mutate + triggerRef()"
        :onPress="mutateAndTrigger"
        color="#f5a623"
      />
    </View>
  </View>
</template>
