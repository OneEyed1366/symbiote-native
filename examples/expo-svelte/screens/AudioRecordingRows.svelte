<script lang="ts">
  import { untrack } from 'svelte';
  import { useAudioRecorderState } from '@symbiote-native/audio/svelte';
  import type { AudioRecorder } from '@symbiote-native/audio/svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { recorder }: { recorder: AudioRecorder } = $props();

  // The parent re-mounts these rows for every new recorder, so the recorder never changes here
  const state = useAudioRecorderState(untrack(() => recorder));
</script>

<ResultRow testID="audio-recording-state" label="recording" value={String(state.current.isRecording)} />
<ResultRow
  testID="audio-recording-duration"
  label="duration"
  value={`${Math.round(state.current.durationMillis / 1_000)} s`}
/>
<ResultRow testID="audio-recording-url" label="url" value={state.current.url ?? 'none'} />
