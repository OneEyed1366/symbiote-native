<script lang="ts">
  import { untrack } from 'svelte';
  import { useAudioRecorderState } from '@symbiote-native/audio/svelte';
  import type { AudioRecorder } from '@symbiote-native/audio/svelte';
  import Card from '../components/Card.svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { recorder, interval }: { recorder: AudioRecorder; interval: number } = $props();

  // The parent re-mounts this card for every new recorder or interval, so neither changes here
  const state = useAudioRecorderState(
    untrack(() => recorder),
    untrack(() => interval),
  );
</script>

<Card testID="audio-recorder-state-card" title="useAudioRecorderState">
  <ResultRow
    testID="audio-recorder-can"
    label="canRecord, isRecording"
    value={`${state.current.canRecord}, ${state.current.isRecording}`}
  />
  <ResultRow
    testID="audio-recorder-duration"
    label="durationMillis"
    value={String(state.current.durationMillis)}
  />
  <ResultRow
    testID="audio-recorder-metering"
    label="metering"
    value={String(state.current.metering ?? 'off')}
  />
  <ResultRow testID="audio-recorder-url" label="url" value={state.current.url ?? 'none'} />
  <ResultRow
    testID="audio-recorder-reset"
    label="mediaServicesDidReset"
    value={String(state.current.mediaServicesDidReset)}
  />
</Card>
