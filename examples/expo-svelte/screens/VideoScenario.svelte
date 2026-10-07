<script lang="ts">
  import ActionButton from '../components/ActionButton.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import RecordedClip from './RecordedClip.svelte';
  import { MAX_RECORD_SECONDS, errorLine } from './camera-shared';
  import type { ICameraDeck } from './camera-shared';

  const { deck, color }: { deck: ICameraDeck; color: string } = $props();

  let uri = $state<string | null>(null);
  let line = $state('not recording');

  async function record(): Promise<void> {
    line = 'recording…';
    try {
      const result = await deck.camera?.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
      uri = result?.uri ?? null;
      line = result === undefined ? 'stopped with no file' : 'saved';
    } catch (error) {
      line = `failed: ${errorLine(error)}`;
    }
  }

  async function togglePause(): Promise<void> {
    try {
      await deck.camera?.toggleRecordingAsync();
    } catch (error) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="camera-video-scenario"
  title="Record a short video message"
  why="Chats, support forms and social apps record a clip of a limited length and play it back before sending. The recording stops by itself at the limit."
  steps={['Switch the camera to the recording mode above', 'Press Record and wait, or press Stop after a few seconds', 'Play the clip below']}
  expect={`The recording ends on Stop or after ${MAX_RECORD_SECONDS} seconds, whichever is first, and the saved clip plays under the buttons with sound.`}
>
  <ResultRow testID="camera-mode-line" label="Camera mode" value={deck.settings.mode} />
  <view class="button-row">
    <ActionButton testID="camera-record" title="Record" {color} onPress={record} />
    <ActionButton testID="camera-stop" title="Stop" {color} onPress={() => deck.camera?.stopRecording()} />
    <ActionButton testID="camera-pause-record" title="Pause or resume (iOS 18)" {color} onPress={togglePause} />
  </view>
  <ResultRow testID="camera-record-result" label="recordAsync" value={line} />
  {#if uri !== null}
    <RecordedClip {uri} />
  {/if}
</Scenario>
