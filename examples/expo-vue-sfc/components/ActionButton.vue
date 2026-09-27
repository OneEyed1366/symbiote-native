<!-- Drop-in for RN's stock <Button>: a bare Button renders as unstyled tinted text on iOS, so a
  bordered pill tinted by `color` replaces it. `onPress` stays a plain callback PROP (not a Vue
  `@press` emit) to mirror React's ActionButton.tsx surface exactly. -->
<script setup lang="ts">
import type { IPressState } from '@symbiote-native/components';

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
const actionButtonStyle = ({ pressed }: IPressState) => ({
  borderColor: props.color,
  opacity: pressed ? 0.6 : 1,
});
</script>

<template>
  <pressable
    :testID="testID"
    class="action-button"
    :style="actionButtonStyle"
    @press="onPress"
  >
    <text class="action-button-text" :style="{ color }">
      {{ title }}
    </text>
  </pressable>
</template>
