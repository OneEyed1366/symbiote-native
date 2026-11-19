<script setup lang="ts">
import { onMounted, onScopeDispose, shallowRef } from 'vue';
import {
  getComputedVariable,
  setVariable,
  useRootTag,
  type IHostInstance,
} from '@symbiote-native/vue';
import ActionButton from '../../components/ActionButton.vue';
import { LINE_COLOR } from '../../navigation-lines';
import PrecedenceTile from './PrecedenceTile.vue';

const ACCENT_NAME = '--lab-accent';
const ACCENT_OVERRIDE = '#ffbe0b';

const surface = useRootTag();
const swatch = shallowRef<IHostInstance | null>(null);
const accent = shallowRef('');
const isOverridden = shallowRef(false);

function accentOf(node: IHostInstance | null): string {
  return node === null ? '' : getComputedVariable(node, ACCENT_NAME);
}

// The write belongs to the surface, so leaving the screen takes it back
onScopeDispose(() => setVariable(surface, ACCENT_NAME, undefined));
onMounted(() => {
  accent.value = accentOf(swatch.value);
});

function onToggle() {
  setVariable(
    surface,
    ACCENT_NAME,
    isOverridden.value ? undefined : ACCENT_OVERRIDE,
  );
  isOverridden.value = !isOverridden.value;
  accent.value = accentOf(swatch.value);
}
</script>

<template>
  <view class="sc-panel">
    <text class="sc-panel-title">12 · Device lab: var(), setVariable</text>
    <text class="sc-tile-label">A :root TOKEN, THEN THE SURFACE'S OWN</text>
    <view class="lab-row">
      <view ref="swatch" class="lab-var-swatch" testID="lab-var-swatch" />
      <text class="lab-readout" testID="lab-var-readout">{{ `${ACCENT_NAME}=${accent}` }}</text>
    </view>
    <ActionButton
      testID="lab-var-toggle"
      :title="isOverridden ? 'Drop the surface value' : 'Write the surface value'"
      :color="LINE_COLOR.styling"
      :onPress="onToggle"
    />
    <text class="sc-tile-caption"
      >The swatch reads var(--lab-accent): violet from the :root token, amber
      once the surface writes its own. The readout is getComputedVariable.</text
    >
    <PrecedenceTile />
  </view>
</template>
