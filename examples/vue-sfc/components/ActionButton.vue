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
import { Pressable, Text } from '@symbiote-native/vue';

const props = defineProps<{
  title: string;
  onPress: () => void;
  color: string;
  testID?: string;
}>();

// The pressed look, as a `style` FUNCTION of press state — RN's own idiom, and the same shape
// CanaryScreen's pressableStyle/retentionStyle use. It briefly lived in `.action-button:active`
// instead, because a template that read `pressed` could not compile to an intrinsic tag and this
// component is 90 call sites. That constraint is GONE: the lowering transform now derives both
// looks from this declaration, so the idiom and the intrinsic tag are no longer a trade-off.
//
// Kept HOISTED rather than written inline in the template on purpose. The SFC path emits a call
// per state and does not substitute (no JS AST in hand), so an inline arrow would allocate two
// closures per render; a hoisted one is created once in setup and only called.
const actionButtonStyle = ({ pressed }: { pressed: boolean }) => ({
  borderColor: props.color,
  opacity: pressed ? 0.6 : 1,
});
</script>

<template>
  <Pressable
    :testID="testID"
    @press="onPress"
    class="action-button"
    :style="actionButtonStyle"
  >
    <Text class="action-button-text" :style="{ color }">{{ title }}</Text>
  </Pressable>
</template>
