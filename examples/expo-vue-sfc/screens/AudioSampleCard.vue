<script setup lang="ts">
import { ref } from 'vue';
import { useAudioSampleListener } from '@symbiote-native/audio/vue';
import type { AudioPlayer, IAudioSample } from '@symbiote-native/audio/vue';
import Card from '../components/Card.vue';
import ToggleRow from '../components/ToggleRow.vue';

const props = defineProps<{ player: AudioPlayer; color: string }>();

const isOn = ref(false);
const sample = ref('no samples yet');

function onSample(data: IAudioSample): void {
  sample.value = `t=${data.timestamp.toFixed(2)}, ${data.channels.length} channel(s), ${data.channels[0]?.frames.length ?? 0} frames`;
}

// The parent re-mounts this card for every new player, so the player never changes here
useAudioSampleListener(props.player, onSample);

function toggle(next: boolean): void {
  isOn.value = next;
  props.player.setAudioSamplingEnabled(next);
}
</script>

<template>
  <Card testID="audio-player-sample-card" title="useAudioSampleListener">
    <ToggleRow
      testID="audio-player-sampling-switch"
      :label="`setAudioSamplingEnabled (supported: ${player.isAudioSamplingSupported})`"
      :value="isOn"
      :onChange="toggle"
      :color="color"
    />
    <text testID="audio-player-sample" class="info-text">{{ sample }}</text>
  </Card>
</template>
