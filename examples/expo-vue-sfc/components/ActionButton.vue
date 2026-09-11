<!--
  Drop-in replacement for RN's stock <Button> (same title/onPress/color/testID surface) — a bare
  Button renders as unstyled tinted text on iOS, visually indistinguishable from a body Text line,
  which was the single biggest source of "looks messy" across the demo app (2026-07 cohesion
  pass). One consistent bordered pill, tinted in the caller's own `color` exactly like Button
  already took, so every screen's per-feature color-coding is preserved — only the chrome becomes
  consistent. Vue SFC twin of .examples/react/components/ActionButton.tsx: `onPress` stays a
  plain callback PROP (not a Vue `@press` emit) to mirror React's exact title/onPress/color/testID
  surface byte-for-byte across every screen that uses it.
-->
<script setup lang="ts">
const props = defineProps<{
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
}>();

// The pressed look, as a `style` FUNCTION of press state — RN's own idiom. It works on the bare
// `<pressable>` tag because the ENGINE resolves it: `routeProp`'s `isStyleCallback` evaluates the
// callback at both values of `pressed` and swaps the pressed one in while the node is held
// (`core/engine/src/node.ts`). No component has to read press state for this.
const actionButtonStyle = ({ pressed }: { pressed: boolean }) => ({
  borderColor: props.color,
  opacity: pressed ? 0.6 : 1,
});
</script>

<template>
  <pressable
    :testID="testID"
    @press="onPress"
    class="action-button"
    :style="actionButtonStyle"
  >
    <text class="action-button-text" :style="{ color }">{{ title }}</text>
  </pressable>
</template>
