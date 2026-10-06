<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ISymbioteEvent } from '@symbiote-native/vue';
import type { IPressState } from '@symbiote-native/components';
import { nativeNumber } from '../components/event-utils';
import { LINE_COLOR } from '../navigation-lines';

const HIT_SLOP = { top: 0, bottom: 40, left: 0, right: 0 };
const RETENTION = { top: 0, bottom: 80, left: 0, right: 0 };

const move = ref({ dx: 0, dy: 0 });
const note = computed(() => `drag me · dx ${move.value.dx} · dy ${move.value.dy}`);
const retentionStyle = ({ pressed }: IPressState) => ({
  backgroundColor: pressed ? LINE_COLOR.primitives : '#13243a',
});

function onMove(event: ISymbioteEvent): void {
  move.value = {
    dx: Math.round(nativeNumber(event, 'locationX')),
    dy: Math.round(nativeNumber(event, 'locationY')),
  };
}
</script>

<template>
  <!-- PASS: press, drag down ~100px and the panel stays highlighted, drag up off the top drops it -->
  <pressable
    :hit-slop="HIT_SLOP"
    :press-retention-offset="RETENTION"
    class="retention-card"
    :style="retentionStyle"
    @press-move="onMove"
  >
    <text class="info-text">
      {{ note }}
    </text>
  </pressable>
</template>
