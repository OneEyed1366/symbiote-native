<script setup lang="ts">
import { ref } from 'vue';
import type { IPressState } from '@symbiote-native/components';
import { LINE_COLOR } from '../navigation-lines';

const emit = defineEmits<{ tap: [] }>();

const COLOR = LINE_COLOR.primitives;
const CHALK = '#cbd5e1';

// The tag resolves its own style at both values of `pressed`, a child has no such channel
const isPressed = ref(false);
const pressableStyle = ({ pressed }: IPressState) => ({
  backgroundColor: pressed ? '#0b1622' : '#13243a',
  borderColor: COLOR,
});
</script>

<template>
  <pressable
    class="pressable-card"
    :style="pressableStyle"
    @press="emit('tap')"
    @press-in="isPressed = true"
    @press-out="isPressed = false"
  >
    <text
      class="pressable-label"
      :style="{ color: isPressed ? COLOR : CHALK }"
    >
      {{ isPressed ? 'holding…' : 'press me (also +1)' }}
    </text>
  </pressable>
</template>
