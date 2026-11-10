<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import type { IHostInstance } from '@symbiote-native/vue';
import { setNativeProps, whenCommitted } from '@symbiote-native/engine';
import ActionButton from '../../components/ActionButton.vue';
import SlotsDemoCard from '../../components/playground/SlotsDemoCard.vue';
import { ACCENT } from './accent';

const REF_FOR_CHIPS = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];

// Deep `ref()` on purpose, kept for contrast and never wired to an imperative call
const deepRefTarget = ref<IHostInstance | null>(null);
const correctRefTarget = useTemplateRef<IHostInstance>('correctRefTarget');
const chipRefs = useTemplateRef<IHostInstance[]>('chipRefs');
const chipRefCount = ref<number | undefined>(undefined);

function flashCorrectRef(): void {
  const node = correctRefTarget.value;
  if (!node) return;
  whenCommitted(node, () =>
    setNativeProps(node, { style: { backgroundColor: ACCENT } }),
  );
}
function readChipRefCount(): void {
  chipRefCount.value = chipRefs.value?.length;
}
</script>

<template>
  <view class="section-nested">
    <text class="section-header"> Slots &amp; Template Refs </text>
    <SlotsDemoCard>
      <text class="note-text"> default slot content </text>
      <template #body="{ tone }">
        <text class="note-text">
          {{ `scoped slot: tone="${tone}"` }}
        </text>
      </template>
      <template #footer>
        <text class="note-text"> named #footer slot content </text>
      </template>
    </SlotsDemoCard>

    <text class="section-label">
      Template ref (Partial — deep ref()) vs useTemplateRef() (3.5+)
    </text>
    <view class="row">
      <view ref="deepRefTarget" testID="deep-ref-target" class="chip" />
      <view ref="correctRefTarget" testID="correct-ref-target" class="chip" />
    </view>
    <text class="note-text">
      Left chip's ref is deliberately the deep `ref()` form (Gotcha 1) — never
      wired to any imperative call, kept for contrast only. Right chip uses
      `useTemplateRef()`, shallow by construction, safely wired to a real
      setNativeProps flash below.
    </text>
    <ActionButton
      testID="flash-correct-ref"
      title="flash the right chip"
      :onPress="flashCorrectRef"
      :color="ACCENT"
    />

    <text class="section-label"> ref_for — an array of refs from v-for </text>
    <view class="row">
      <view
        v-for="chip in REF_FOR_CHIPS"
        :key="chip.id"
        ref="chipRefs"
        class="chip"
      >
        <text class="chip-text">
          {{ chip.id }}
        </text>
      </view>
    </view>
    <ActionButton
      testID="ref-for-read"
      title="read chipRefs.length"
      :onPress="readChipRefCount"
      :color="ACCENT"
    />
    <text
      v-if="chipRefCount !== undefined"
      class="list-row-text"
      testID="ref-for-count"
    >
      {{ `chipRefs.value.length = ${chipRefCount}` }}
    </text>
    <text class="note-text">
      `key` and `is` are exercised throughout this screen (every v-for above,
      KeepAlive's &lt;component :is&gt;).
    </text>
  </view>
</template>
