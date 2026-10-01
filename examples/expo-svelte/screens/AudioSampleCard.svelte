<script lang="ts">
  import { untrack } from 'svelte';
  import { useAudioSampleListener } from '@symbiote-native/audio/svelte';
  import type { AudioPlayer, IAudioSample } from '@symbiote-native/audio/svelte';
  import Card from '../components/Card.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';

  let { player, color }: { player: AudioPlayer; color: string } = $props();

  let isOn = $state(false);
  let sample = $state('no samples yet');

  function onSample(data: IAudioSample): void {
    sample = `t=${data.timestamp.toFixed(2)}, ${data.channels.length} channel(s), ${data.channels[0]?.frames.length ?? 0} frames`;
  }

  // The parent re-mounts this card for every new player, so the player never changes here
  useAudioSampleListener(untrack(() => player), onSample);

  function toggle(next: boolean): void {
    isOn = next;
    player.setAudioSamplingEnabled(next);
  }
</script>

<Card testID="audio-player-sample-card" title="useAudioSampleListener">
  <ToggleRow
    testID="audio-player-sampling-switch"
    label={`setAudioSamplingEnabled (supported: ${player.isAudioSamplingSupported})`}
    value={isOn}
    onChange={toggle}
    {color}
  />
  <text testID="audio-player-sample" class="info-text">{sample}</text>
</Card>
